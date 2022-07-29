import { Contract, Script, NodeProvider, NodeWallet } from '@alephium/web3'

const accessWallet = async (provider) => {
  const address = '1DrDyTr9RpRsQnDnXo2YRiPzPW4ooHX5LLoqXrqfMrpQH'
  const signer = new NodeWallet(provider, 'alephium-web3-test-only-wallet')
  await signer.unlock('alph')
  return {
    address,
    signer
  }
}

const ALPH = 1000000000000000000
const initializeContractScriptData = (filePath: string) => ({
    filePath,
    instance: null,
    params: null,
    unsignedTxObj: null
})

describe('Invoice contract', () => {
  let provider
  let wallet
  let contract = initializeContractScriptData('invoice.ral')
  let script = {
    pay: initializeContractScriptData('invoice_pay.ral'),
    destroy: initializeContractScriptData('invoice_destroy.ral'),
  }

  beforeAll(async () => {
    provider = new NodeProvider('http://127.0.0.1:22973')
    wallet = await accessWallet(provider)
  })

  beforeEach(async () => {
    contract.params  = {
      initialFields: {
        payTo: wallet.address,
        paymentAttoAlphAmount: BigInt(3 * ALPH),
        paymentDueAt: new Date().getTime(),
        paid: false,
        paidAt: 0,
        receiptOwner: wallet.address,
        nonce: 'eeeeee' // Same nonce for consistence in tests
      },
      initialTokenAmounts: []
    }

    contract.instance = await Contract.fromSource(provider, contract.filePath)
    contract.unsignedTxObj = await contract.instance.transactionForDeployment(wallet.signer, contract.params)
    await wallet.signer.submitTransaction(contract.unsignedTxObj.unsignedTx, contract.unsignedTxObj.txId)

    script.pay.instance = await Script.fromSource(provider, script.pay.filePath)
  })

  it('add the proper amount when under-payment occurs several times', async () => {
    script.pay.params = {
      signerAddress: wallet.address,
      attoAlphAmount: BigInt(1 * ALPH),
      initialFields: {
        invoiceContractId: contract.unsignedTxObj.contractId,
        payFrom: wallet.address,
        attoAlphAmount: BigInt(1 * ALPH)
      }
    }
    script.pay.unsignedTxObj = await script.pay.instance.paramsForDeployment(script.pay.params)

    let rounds = BigInt(contract.params.initialFields.paymentAttoAlphAmount / script.pay.params.initialFields.attoAlphAmount)
    while (rounds > BigInt(0)) {
      await wallet.signer.signExecuteScriptTx(script.pay.unsignedTxObj)
      rounds -= BigInt(1)
    }

    // Make one more payment to overpay
    try {
      await wallet.signer.signExecuteScriptTx(script.pay.unsignedTxObj)
    } catch (e) {
      expect(e.error.detail.indexOf('AssertionFailedWithErrorCode')).toBeGreaterThanOrEqual(0)
    }

    const state = await contract.instance.fetchState(provider, contract.unsignedTxObj.contractAddress, 0)
    expect(state.asset.alphAmount).toBe(contract.params.initialFields.paymentAttoAlphAmount + BigInt(1 * ALPH))
    expect(state.fields.paid).toBe(true)
  })

  it('stop a single payee from over-payment', async () => {
    const attoAlphAmount = contract.params.initialFields.paymentAttoAlphAmount + BigInt(1 * ALPH)

    script.pay.params = {
      signerAddress: wallet.address,
      attoAlphAmount,
      initialFields: {
        invoiceContractId: contract.unsignedTxObj.contractId,
        payFrom: wallet.address,
        attoAlphAmount,
      }
    }
    script.pay.unsignedTxObj= await script.pay.instance.paramsForDeployment(script.pay.params)
    await wallet.signer.signExecuteScriptTx(script.pay.unsignedTxObj)
    const state = await contract.instance.fetchState(provider, contract.unsignedTxObj.contractAddress, 0)

    // Plus 1 ALPH to account for the "storage deposit"
    expect(state.asset.alphAmount).toBe(contract.params.initialFields.paymentAttoAlphAmount + BigInt(1 * ALPH))
  })
})
