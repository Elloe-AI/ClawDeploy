# crypto-utils

Cryptographic helpers used across services.

## Capabilities

- hash and verify secrets with scrypt
- encrypt and decrypt strings with AES-256-GCM
- sign and verify HMAC payloads

## Usage

```ts
import { encryptString, decryptString, hashSecret, verifySecret } from "@clawdeploy/crypto-utils";

const { hash, salt } = hashSecret("runner-secret");
const ok = verifySecret("runner-secret", hash, salt);

const encrypted = encryptString("token", process.env.DATA_ENCRYPTION_KEY!);
const decrypted = decryptString(encrypted, process.env.DATA_ENCRYPTION_KEY!);
```
