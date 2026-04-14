declare module "@polkadot/util-crypto" {
  function cryptoWaitReady(): Promise<boolean>;
  function sr25519Verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array
  ): boolean;
  function decodeAddress(address: string): Uint8Array;
}

declare module "@polkadot/util" {
  function u8aToHex(value: Uint8Array): string;
  function hexToU8a(value: string): Uint8Array;
}
