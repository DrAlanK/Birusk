import { connect } from "cloudflare:sockets";

let authCache = new Set();
let usageMap = new Map();
let lastSync = 0;
let lastUsageSync = 0;

async function syncConfig(env) {
    if (Date.now() - lastSync < 60000) return;
    try {
        const resp = await fetch(`${env.MASTER_URL}/api/sync`, {
            headers: { "Authorization": `Bearer ${env.NODE_TOKEN}` }
        });
        if (resp.ok) {
            const data = await resp.json();
            if (data.uuids && Array.isArray(data.uuids)) {
                authCache = new Set(data.uuids.map(u => u.replace(/-/g, '').toLowerCase()));
                lastSync = Date.now();
            }
        }
    } catch (e) {}
}

async function flushUsage(env) {
    if (usageMap.size === 0) return;
    if (Date.now() - lastUsageSync < 60000) return;
    
    const payload = [];
    for (const [uid, bytes] of usageMap.entries()) {
        payload.push({ user_id: uid, bytes_used: bytes });
    }
    
    usageMap.clear();
    lastUsageSync = Date.now();

    try {
        const resp = await fetch(`${env.MASTER_URL}/api/usage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.NODE_TOKEN}`
            },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) {
            for (const item of payload) {
                recordUsage(item.user_id, item.bytes_used);
            }
        }
    } catch (e) {
        for (const item of payload) {
            recordUsage(item.user_id, item.bytes_used);
        }
    }
}

function recordUsage(uuid, bytes) {
    const current = usageMap.get(uuid) || 0;
    usageMap.set(uuid, current + bytes);
}

function formatUUID(hex) {
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export default {
    async fetch(request, env, ctx) {
        const upgrade = request.headers.get("Upgrade");
        if (!upgrade || upgrade.toLowerCase() !== "websocket") {
            return new Response("Birusk Edge Node Active", { status: 200 });
        }

        ctx.waitUntil(syncConfig(env));
        ctx.waitUntil(flushUsage(env));

        const [client, ws] = Object.values(new WebSocketPair());
        ws.accept();

        let remoteSocket = null;
        let isFirstChunk = true;
        let currentUserHex = null;
        let currentUserId = null;

        ws.addEventListener("message", async (e) => {
            const data = e.data;
            
            if (isFirstChunk) {
                isFirstChunk = false;
                const view = new Uint8Array(data);
                
                if (view[0] !== 0) { 
                    ws.close(); 
                    return; 
                }
                
                currentUserHex = Array.from(view.slice(1, 17)).map(b => b.toString(16).padStart(2, "0")).join("");
                
                if (!authCache.has(currentUserHex)) {
                    ws.close(); 
                    return;
                }
                
                currentUserId = formatUUID(currentUserHex);
                
                recordUsage(currentUserId, data.byteLength);

                const optLen = view[17];
                const pPos = 18 + optLen + 1;
                const port = new DataView(data.slice(pPos, pPos + 2)).getUint16(0);
                const aType = view[pPos + 2];
                
                let vPos = pPos + 3;
                let aLen = 0;
                let targetAddr = "";
                
                if (aType === 1) {
                    aLen = 4;
                    targetAddr = view.slice(vPos, vPos + aLen).join(".");
                } else if (aType === 2) {
                    aLen = view[vPos];
                    vPos++;
                    targetAddr = new TextDecoder().decode(view.slice(vPos, vPos + aLen));
                } else if (aType === 3) {
                    aLen = 16;
                    const dv = new DataView(data.slice(vPos, vPos + aLen));
                    targetAddr = Array.from({ length: 8 }, (_, i) => dv.getUint16(i * 2).toString(16)).join(":");
                }
                
                ws.send(new Uint8Array([0, 0]));
                
                try {
                    remoteSocket = connect({ hostname: targetAddr, port: port });
                    await remoteSocket.opened;
                    
                    const offset = vPos + aLen;
                    if (offset < data.byteLength) {
                        const writer = remoteSocket.writable.getWriter();
                        await writer.write(data.slice(offset));
                        writer.releaseLock();
                    }
                    
                    let trackingStream = new TransformStream({
                        transform(chunk, controller) {
                            recordUsage(currentUserId, chunk.byteLength);
                            controller.enqueue(chunk);
                        }
                    });
                    
                    remoteSocket.readable.pipeThrough(trackingStream).pipeTo(new WritableStream({
                        write(chunk) {
                            ws.send(chunk);
                        }
                    }));
                } catch (err) {
                    ws.close();
                }
            } else if (remoteSocket) {
                recordUsage(currentUserId, data.byteLength);
                
                const writer = remoteSocket.writable.getWriter();
                await writer.write(data);
                writer.releaseLock();
            }
            
            ctx.waitUntil(flushUsage(env));
        });

        return new Response(null, { status: 101, webSocket: client });
    }
}