// net.js - room transport for Wizard Party over public MQTT relays (secure WebSocket), so phones on any network can join
// with a 4-letter code and no accounts. The host device runs the game; phones send their moves and draw what the host sends.
// Every message goes out on every relay that is up and is de-duplicated on arrival, so one relay being down changes nothing.
// Topics: <base>/l lobby (host, retained), <base>/h game state (host -> everyone), <base>/g phones -> host.
const NET = (() => {
  const BROKERS = ["wss://broker.emqx.io:8084/mqtt", "wss://test.mosquitto.org:8081/mqtt", "wss://broker.hivemq.com:8884/mqtt"];
  const PREFIX = "wizardparty-v1/";
  let clients = [], base = "", handlers = {}, room = "", status = () => {}, msgN = 0, wasOnline = false;
  const seen = new Set(), seenQ = [];
  const cid = (() => { try { let v = localStorage.getItem("wp_cid"); if (!v) { v = Math.random().toString(36).slice(2, 10); localStorage.setItem("wp_cid", v); } return v; } catch (e) { return Math.random().toString(36).slice(2, 10); } })();
  const code = () => Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.random() * 24 | 0]).join("");
  const up = () => clients.filter(c => c.connected).length;
  function report() {
    const n = up();
    if (n) status("online", "Connected to room " + room + (n > 1 ? " (" + n + " relays)" : ""));
    else status("connecting", wasOnline ? "Connection lost, retrying..." : "Connecting...");
    if (n && !wasOnline && handlers.connect) handlers.connect();
    wasOnline = n > 0;
  }
  function connect(r, subs, onStatus) {
    room = r.toUpperCase(); base = PREFIX + room; status = onStatus || status;
    if (typeof mqtt === "undefined") { status("offline", "The network library did not load. Check the connection and reload."); return; }
    for (const c of clients) try { c.end(true); } catch (e) {}
    clients = []; wasOnline = false; status("connecting", "Connecting...");
    for (const url of BROKERS) {
      const c = mqtt.connect(url, { clientId: "wp_" + cid + "_" + (Math.random() * 1e6 | 0), clean: true, reconnectPeriod: 3000, connectTimeout: 9000, keepalive: 20 });
      c.on("connect", () => { c.subscribe(subs.map(s => base + "/" + s), { qos: 1 }); report(); });
      c.on("close", report); c.on("offline", report); c.on("error", () => {});
      c.on("message", (topic, payload) => {
        let m; try { m = JSON.parse(payload.toString()); } catch (e) { return; }
        if (m && m._i) { if (seen.has(m._i)) return; seen.add(m._i); seenQ.push(m._i); if (seenQ.length > 3000) seen.delete(seenQ.shift()); }
        const sub = topic.slice(base.length + 1); if (handlers[sub]) handlers[sub](m);
      });
      clients.push(c);
    }
  }
  function pub(sub, obj, opts) {
    if (!up()) return false;
    obj._i = cid + "." + (++msgN);
    const text = JSON.stringify(obj);
    for (const c of clients) if (c.connected) c.publish(base + "/" + sub, text, Object.assign({ qos: 0 }, opts || {}));
    return true;
  }
  return { cid, code, connect, pub, on(sub, fn) { handlers[sub] = fn; }, get room() { return room; }, get online() { return up() > 0; } };
})();
