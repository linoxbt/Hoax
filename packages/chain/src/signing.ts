import { receiptHash, type Receipt } from "@hoax/core";
import { recoverMessageAddress, type Address, type Hex } from "viem";
import type { TradingSigner } from "./venue.ts";

/** Sign a receipt's hash with the Hoax key (EIP-191 over the 32 raw bytes). */
export async function signReceipt(signer: TradingSigner, receipt: Receipt): Promise<{ hash: Hex; signature: Hex }> {
  const hash = receiptHash(receipt);
  const signature = await signer.signMessage({ message: { raw: hash } });
  return { hash, signature };
}

/** The address that signed a receipt; compare it with the receipt's hoaxKey. */
export async function receiptSigner(receipt: Receipt, signature: Hex): Promise<Address> {
  return recoverMessageAddress({ message: { raw: receiptHash(receipt) }, signature });
}
