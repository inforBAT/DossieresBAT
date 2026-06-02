import assert from "node:assert/strict";
import { assertSafePublicHttpUrl, isPrivateOrLocalIp } from "./safeUrlFetch";

assert.equal(isPrivateOrLocalIp("127.0.0.1"), true);
assert.equal(isPrivateOrLocalIp("0.0.0.0"), true);
assert.equal(isPrivateOrLocalIp("10.0.0.1"), true);
assert.equal(isPrivateOrLocalIp("172.16.0.1"), true);
assert.equal(isPrivateOrLocalIp("172.31.255.255"), true);
assert.equal(isPrivateOrLocalIp("172.32.0.1"), false);
assert.equal(isPrivateOrLocalIp("192.168.1.1"), true);
assert.equal(isPrivateOrLocalIp("169.254.169.254"), true);
assert.equal(isPrivateOrLocalIp("::1"), true);
assert.equal(isPrivateOrLocalIp("fe80::1"), true);
assert.equal(isPrivateOrLocalIp("8.8.8.8"), false);

void (async () => {
  await assert.rejects(
    () => assertSafePublicHttpUrl("http://localhost:3000"),
    /hosts locales|URL/i,
  );
  await assert.rejects(
    () => assertSafePublicHttpUrl("http://127.0.0.1"),
    /IP local o privada/i,
  );
  await assert.rejects(
    () => assertSafePublicHttpUrl("http://0.0.0.0"),
    /IP local o privada/i,
  );
  await assert.rejects(
    () => assertSafePublicHttpUrl("http://169.254.169.254"),
    /IP local o privada/i,
  );
  await assert.rejects(
    () => assertSafePublicHttpUrl("http://10.0.0.1"),
    /IP local o privada/i,
  );
  await assert.rejects(
    () => assertSafePublicHttpUrl("http://172.16.0.1"),
    /IP local o privada/i,
  );
  await assert.rejects(
    () => assertSafePublicHttpUrl("http://172.31.255.255"),
    /IP local o privada/i,
  );
  await assert.doesNotReject(() => assertSafePublicHttpUrl("http://172.32.0.1"));
  await assert.rejects(
    () => assertSafePublicHttpUrl("http://192.168.1.1"),
    /IP local o privada/i,
  );
  await assert.doesNotReject(() => assertSafePublicHttpUrl("https://example.com"));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
