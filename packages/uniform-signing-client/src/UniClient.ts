import { toBase64 } from "@cosmjs/encoding";
import { Registry } from '@cosmjs/proto-signing'
import { defaultRegistryTypes } from "@cosmjs/stargate";
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { AbstractWallet, WalletArgument, WalletName, createWallet } from "./Wallet";
import { post } from "./utils/http";
import { Transaction, TxResponse } from "./utils/type";
import { wasmTypes } from "@cosmjs/cosmwasm-stargate/build/modules";
import { makeAuthInfoBytes, TxBodyEncodeObject } from "@cosmjs/proto-signing/build";
import { Any } from "cosmjs-types/google/protobuf/any";

export function isEthermint(chainId: string) {
  return chainId.search(/\w+_\d+-\d+/g) > -1
}

export class UniClient {
  registry: Registry
  wallet: AbstractWallet
  constructor(name: WalletName, arg: WalletArgument) {
    this.registry = new Registry([...defaultRegistryTypes, ...wasmTypes])
    this.wallet = createWallet(name, arg, this.registry)
  }

  async getAccounts() {
    return this.wallet.getAccounts()
  }

  async sign(transaction: Transaction): Promise<TxRaw> {
    // const { signature, signed } = await this.wallet.sign(transaction);
    // return TxRaw.fromPartial({
    //     bodyBytes: signed.bodyBytes,
    //     authInfoBytes: signed.authInfoBytes,
    //     signatures: [fromBase64(signature.signature)],
    // });
    return this.wallet.sign(transaction)
  }

  async simulate(
    endpoint: string,
    transaction: Transaction
  ) {

    const pubkey = Any.fromPartial({
      typeUrl: '/cosmos.crypto.ed25519.PubKey',
      value: new Uint8Array()
    })
    const txBodyEncodeObject: TxBodyEncodeObject = {
      typeUrl: "/cosmos.tx.v1beta1.TxBody",
      value: {
        messages: transaction.messages,
        memo: transaction.memo,
      },
    };

    const txBodyBytes = this.registry.encode(txBodyEncodeObject);
    const gasLimit = Number(transaction.fee.gas);
    const authInfoBytes = makeAuthInfoBytes(
      [{ pubkey, sequence: transaction.signerData.sequence }],
      transaction.fee.amount,
      gasLimit,
      transaction.fee.granter,
      transaction.fee.payer,
    );

    const txRaw = TxRaw.fromPartial({
      bodyBytes: txBodyBytes,
      authInfoBytes: authInfoBytes,
      signatures: [new Uint8Array()],
    });

    const txbytes = toBase64(TxRaw.encode(txRaw).finish())
    const request = {
      tx_bytes: txbytes,
      mode: 'BROADCAST_MODE_SYNC', // BROADCAST_MODE_SYNC, BROADCAST_MODE_BLOCK, BROADCAST_MODE_ASYNC
    }
    return post(`${endpoint}/cosmos/tx/v1beta1/simulate`, request).then(res => {
      if (res.code && res.code !== 0) {
        throw new Error(res.message)
      }
      if (res.tx_response && res.tx_response.code !== 0) {
        throw new Error(res.tx_response.raw_log)
      }
      return Number(res.gas_info.gas_used)
    })
  }

  async broadcastTx(endpoint, bodyBytes: TxRaw): Promise<{ tx_response: TxResponse }> {
    // const txbytes = bodyBytes.authInfoBytes ? TxRaw.encode(bodyBytes).finish() : bodyBytes
    const txbytes = TxRaw.encode(bodyBytes).finish()
    const txString = toBase64(txbytes)
    const txRaw = {
      tx_bytes: txString,
      mode: 'BROADCAST_MODE_SYNC', // BROADCAST_MODE_SYNC, BROADCAST_MODE_BLOCK, BROADCAST_MODE_ASYNC
    }
    return post(`${endpoint}/cosmos/tx/v1beta1/txs`, txRaw).then(res => {
      if (res.code && res.code !== 0) {
        throw new Error(res.message)
      }
      if (res.tx_response && res.tx_response.code !== 0) {
        throw new Error(res.tx_response.raw_log)
      }
      return res
    })
  }
}