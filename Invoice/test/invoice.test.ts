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

describe('Invoice contract', () => {
  let invoice
  let provider
  let wallet

  beforeAll(async () => {
    provider = new NodeProvider('http://127.0.0.1:22973')
    wallet = await accessWallet(provider)
  })

  beforeEach(async () => {
    invoice = await Contract.fromSource(provider, 'invoice.ral')
  })

  it('subtract amount leftover', async () => {
    const params = {
      initialFields: {
        payTo: wallet.address,
        paymentAttoAlphAmount: 1e18 * 5,
        paymentDueAt: new Date().getTime(),
        paid: false,
        paidAt: 0,
        receiptOwner: wallet.address,
        identifier: '7777',
      },
      initialTokenAmounts: []
    }
    const deployContract = await invoice.transactionForDeployment(wallet.signer, params)
    const submitResult = await wallet.signer.submitTransaction(deployContract.unsignedTx, deployContract.txId)
    //const state = await invoice.fetchState(provider, deployContract.contractAddress, 0)
    const makePaymentScript = await Script.fromSource(provider, 'make_payment.ral')
    const params2 = {
      signerAddress: wallet.address,
      initialFields: {
        invoiceContractId: deployContract.contractId,
        payFrom: wallet.address,
        attoAmount: 1e18 * 2
      }
    }
    const deployScript = await makePaymentScript.paramsForDeployment(params2)
    await wallet.signer.signExecuteScriptTx(deployScript)

    const state = await invoice.fetchState(provider, deployContract.contractAddress, 0)
    console.log(state)
  })
  it('allow payTo to destroy', () => {
  })
  it('return any leftover to receipt owner', () => {
  })
  it('should be paid when paidAmount is satisfied', () => {
  })
  it('not be destroyed when paid', () => {
  })
})
