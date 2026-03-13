import { decrypt, encrypt } from "./encryption";

export class EncryptedField<T = string> {
  private encrypted?: string = null;

  constructor(value?: T | string) {
    if (typeof value === "string" && this.isEncrypted(value)) {
      this.encrypted = value;
    } else if (value !== undefined && value !== null) {
      this.set(value as T);
    }
  }

  private isEncrypted(value: string) {
    return value.length > 32; // simple heuristic
  }

  set(value: T) {
    const str = JSON.stringify(value);
    this.encrypted = encrypt(str);
  }

  get(): T | undefined {
    if (!this.encrypted) return null;

    const decrypted = decrypt(this.encrypted);
    return JSON.parse(decrypted);
  }

  toDB() {
    return this.encrypted;
  }

  static fromDB(value: string) {
    const field = new EncryptedField();
    field.encrypted = value;
    return field;
  }

  toString() {
    return this.encrypted;
  }
}
