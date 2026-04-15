import { decrypt, encrypt } from "./encryption";

export class EncryptedField<T = string> {
  private encrypted: string | null = null;

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

  get(): T | null {
    if (!this.encrypted) return null;
      
    const decrypted = decrypt(this.encrypted);
    return JSON.parse(decrypted);
  }

  validate() {
    if (!this.encrypted) return true;
    try {
      const decrypted = decrypt(this.encrypted);
      JSON.parse(decrypted);
      return true;
    } catch (e) {
      return false;
    }
  }
  isSet() {
    return !!this.encrypted;
  }

  isEmpty() {
    return !this.encrypted;
  }

  toDB() {
    return this.encrypted;
  }

  static fromDB<T>(value: string) {
    const field = new EncryptedField<T>();
    field.encrypted = value;
    return field;
  }

  toString() {
    return this.encrypted;
  }
}
