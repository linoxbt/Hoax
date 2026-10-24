import { receiptHash, resolutionHash, type Receipt, type Resolution } from "@hoax/core";
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

/** Sign a resolution record the same way, with the same key as the receipt it resolves. */
export async function signResolution(signer: TradingSigner, resolution: Resolution): Promise<{ hash: Hex; signature: Hex }> {
  const hash = resolutionHash(resolution);
  const signature = await signer.signMessage({ message: { raw: hash } });
  return { hash, signature };
}

export async function resolutionSigner(resolution: Resolution, signature: Hex): Promise<Address> {
  return recoverMessageAddress({ message: { raw: resolutionHash(resolution) }, signature });
}
