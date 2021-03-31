const axios = require('axios')
const AWS = require('aws-sdk');
const Web3 = require('web3')
const EthereumTx = require('ethereumjs-tx')
const BigNumber = require("bignumber.js");

// dynamodb
let dynamodb = new AWS.DynamoDB.DocumentClient();

// scan.io api set up ，adjust according to different chain
/*
main - http://api.etherscan.io/api
ropsten - https://api-ropsten.etherscan.io/api

bsc - https://api.bscscan.com/api
bsctest - https://api-testnet.bscscan.com/api
*/
// A-chain scan.io
const Receive_url = 'https://api-ropsten.etherscan.io/api';
// B-chain scan.io
const Send_url = 'https://api-testnet.bscscan.com/api'

// scan.io  APIKEY
// A-chain APIKEY
RECEIVEAPIKEY = ''

// B-chain APIKEY
SENDAPIKEY = ''

// Set up the A-chain token contract address and the receiving address to obtain the A chain transaction data
RECEIVE_WALLET_ADDRESS = ''
RECEIVE_COINCONTRACT_ADDRESS = ''


// Set the B-chain token contract address, sending address, and private key of the sending address to perform B-chain transfers
TRANSFER_WALLET_ADDRESS = ''
TRANSFER_COINCONTRACT_ADDRESS = ''
TRANSFER_WALLET_PRIVATE_KEY = ''

// Set up B-chain ID to perform B-chain transfers
/*
  main - 1
  ropsten - 3
  bsc - 56
  bsctest - 97
  xdai - 100
*/
CHAIN_ID = XX

// Initialize the starting block of query transaction data of the A chain
CURRENT_BLOCK = '9932203'

// dynamodb database table name
DYNAMODB_TYPE = ''

// Set up B-chain  Provier
//bsc - https://bsc-dataseed.binance.org/
//bsctest - https://data-seed-prebsc-1-s1.binance.org:8545/
//mainNet - infura or alchemy ...
//ropsten - infura or alchemy ...
const web3Net = ''
const web3 = new Web3(new Web3.providers.HttpProvider(web3Net))

web3.eth.defaultAccount = TRANSFER_WALLET_ADDRESS

// Set up the service fee for B chain transfer (0~100）
SERVICEFEE = 0


exports.lambdaHandler = async (event, context) => {
  var currentBlock = CURRENT_BLOCK
  var isFirst = true
  var nonce = 0
  var transferArray = []
  var DBresult = {}


  var table_name = 'crossChainTransfer'
  var table_type = DYNAMODB_TYPE
  var searchParams = {
    TableName: table_name,
    Key: {
      type: table_type
    }
  };
  try {
    var search = await dynamodb.get(searchParams).promise()
  } catch (error) {
    return JSON.stringify({
      'statusCode': 200,
      'body': {
        "code": 1,
        "message": `${DYNAMODB_TYPE}Database read failed`
      }
    })
  }
  // Database read successfully
  if (Object.keys(search).length === 0) {
    var FirstInputParams = {
      TableName: table_name,
      Item: {
        'type': table_type,
        'address': '',
        'txHash': '',
        'currentBlock': '',
        'transferValue': '',
        'nonce': 0,
      }
    }
    try {
      await dynamodb.put(FirstInputParams).promise()
    } catch (error) {
      return JSON.stringify({
        'statusCode': 200,
        'body': {
          "code": 13,
          "message": `${DYNAMODB_TYPE}Database write failure ${error}`
        }
      })
    }
  } else {
    DBresult = search.Item
    if (DBresult.address !== '' && DBresult.txHash !== '') {
      isFirst = false
      currentBlock = DBresult.currentBlock
    }
  }
  try {
    // Get the B chain transfer wallet nonce
    nonce = await web3.eth.getTransactionCount(TRANSFER_WALLET_ADDRESS, 'pending')
    if (!isFirst) {
      if (nonce <= DBresult.nonce && nonce !== 0) {
        return JSON.stringify({
          'statusCode': 200,
          'body': {
            "code": 2,
            "message": `${nonce} < ${DBresult.nonce} There are pending transactions on the chain`
          }
        })
      }
    }
  } catch (error) {
    return JSON.stringify({
      'statusCode': 200,
      'body': {
        "code": 3,
        "message": `Failed to get nonce ${error}`
      }
    })
  }
  // After obtaining the nonce, use scan.io api to scan the transaction information of the A-Chain receiving address
  try {
    var response = await axios.get(Receive_url, {
      params: {
        module: 'account',
        action: 'tokentx',
        contractaddress: RECEIVE_COINCONTRACT_ADDRESS,
        address: RECEIVE_WALLET_ADDRESS,
        startblock: currentBlock,
        endblock: '999999999',
        sort: 'asc',
        apikey: RECEIVEAPIKEY
      }
    })
  } catch (error) {
    return JSON.stringify({
      'statusCode': 200,
      'body': {
        "code": 4,
        "message": `Scan.io failed to get the transfer list ${error}`
      }
    })
  }
  var mid = response.data
  if (mid.status !== '1') {
    return JSON.stringify({
      'statusCode': 200,
      'body': {
        "code": 5,
        "message": `Scan.io returns incorrect data= ${mid.message}`
      }
    })
  }
  var scanResult = mid.result
  if (scanResult.length === 0) {
    return JSON.stringify({
      'statusCode': 200,
      'body': {
        "code": 6,
        "message": "Scan.io got an empty transfer list"
      }
    })
  }
  for (var i = scanResult.length - 1; i >= 0; i--) {
    const scanItem = scanResult[i];
    if (scanItem.to.toLocaleLowerCase() !== RECEIVE_WALLET_ADDRESS.toLocaleLowerCase() ||
      scanItem.to.toLocaleLowerCase() === scanItem.from.toLocaleLowerCase()
    ) {
      continue
    }
    if (isFirst) {
      var transferItem = {
        'txHash': scanItem.hash,
        'address': scanItem.from,
        'transferValue': scanItem.value,
        'blockNumber': scantem.blockNumber,
      }
      transferArray.unshift(transferItem)
    } else {
      var transferItem = {
        'txHash': scanItem.hash,
        'address': scanItem.from,
        'transferValue': scanItem.value,
        'blockNumber': scanItem.blockNumber
      }
      if (transferItem.txHash === DBresult.txHash && transferItem.address === DBresult.address) {
        break;
      } else {
        transferArray.unshift(transferItem)
      }
    }
  }
  if (transferArray.length === 0) {
    return JSON.stringify({
      'statusCode': 200,
      'body': {
        "code": 7,
        "message": "The array of transactions to be transferred is empty"
      }
    })
  }
  // get gasPrice
  /*
    B - chain: bsc => gasPrice needs to be greater than 10
    B - chain: bsctest => gasPrice needs to be greater than 20
  */
  try {
    var gasPrice = await getCurrentGasPrices()
    // bsctest
    // if (web3.utils.hexToNumber(gasPrice) < 20 * 1e9) {
    //   gasPrice = web3.utils.toHex(20 * 1e9)
    // }
    // bsc
    // if (web3.utils.hexToNumber(gasPrice) < 10 * 1e9) {
    //   gasPrice = web3.utils.toHex(10 * 1e9)
    // }
  } catch (error) {
    return JSON.stringify({
      'statusCode': 200,
      'body': {
        "code": 8,
        "message": `Failed to get gasPrice ${error}`
      }
    })
  }
  for (var i = 0; i < transferArray.length; i++) {
    var transferItem = transferArray[i];

    var fromAddress = TRANSFER_WALLET_ADDRESS;
    var toAddress = transferItem.address;

    var transferAmount = getTransferValue(transferItem.transferValue);
    var transferNonce = nonce

    var contractAddress = TRANSFER_COINCONTRACT_ADDRESS;
    var contractABI = contract_abi
    var getContract = new web3.eth.Contract(contractABI, contractAddress, {
      from: fromAddress
    });


    var gasLimit = '100000'

    // Specify a maximum value for gasPrice
    if (web3.utils.hexToNumber(gasPrice) > 200 * 1e9) {
      return JSON.stringify({
        'statusCode': 200,
        'body': {
          "code": 9,
          "message": `gasPrice is too high ${gasPrice}`
        }
      })
    }
    console.log('gasPrice = ', web3.utils.hexToNumber(gasPrice) / 1e9)
    var rawTransaction = {
      "from": fromAddress,
      "nonce": "0x" + transferNonce.toString(16),
      "gasPrice": gasPrice,
      "gasLimit": web3.utils.toHex(gasLimit),
      "to": contractAddress,
      "value": "0x0",
      "data": getContract.methods.transfer(toAddress, web3.utils.toHex(transferAmount)).encodeABI(),
      "chainId": CHAIN_ID
    };

    const transaction = new EthereumTx(rawTransaction)
    transaction.sign(Buffer.from(TRANSFER_WALLET_PRIVATE_KEY, 'hex'))
    const serializedTransaction = transaction.serialize()

    const FirstUpdateParams = {
      TableName: table_name,
      Key: {
        "type": table_type
      },
      UpdateExpression: "set address = :a, txHash = :b, currentBlock = :c, transferValue = :d, nonce = :r",
      ExpressionAttributeValues: {
        ":a": transferItem.address,
        ":b": transferItem.txHash,
        ":c": transferItem.blockNumber,
        ":d": transferItem.transferValue,
        ":r": transferNonce
      },
      ReturnValues: "UPDATED_NEW"
    };
    try {
      await dynamodb.update(FirstUpdateParams).promise()
    } catch (error) {
      return JSON.stringify({
        'statusCode': 200,
        'body': {
          "code": 10,
          "message": `Failed to write to the database, terminate sending the transaction ${error}`
        }
      })
    }

    web3.eth.sendSignedTransaction('0x' + serializedTransaction.toString('hex'))
      .on('transactionHash', (hash) => {
        console.log("hash " + hash)
      })
      // .on('receipt', (receipt) => {
      //   console.log("receipt " + receipt)
      // })
      .on('error', (error) => {
        console.log("error " + error)
      })
    await sleep(2000)
    nonce++;
  }
  return JSON.stringify({
    'statusCode': 200,
    'body': {
      "code": 0,
      "message": 'success'
    }
  })
}

function sleep(millisecond) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve()
    }, millisecond)
  })
}



const getTransferValue = (originValue) => {
  var var1 = new BigNumber(originValue).dividedBy(new BigNumber(100))
  var var2 = new BigNumber(100).minus(new BigNumber(SERVICEFEE))
  var var3 = new BigNumber(var1).multipliedBy(new BigNumber(var2))
  var result = var3.decimalPlaces(8)
  return result
}

const getCurrentGasPrices = async () => {
  try {
    var response = await axios.get(Send_url, {
      params: {
        module: 'proxy',
        action: 'eth_gasPrice',
        apikey: SENDAPIKEY
      }
    })
    if (response.status === 200 && response.statusText === 'OK') {
      return response.data.result
    } else {
      throw new Error('gasPrice interface request failed');
    }
  } catch (error) {
    throw (error)
  }
}

const contract_abi = [{
  "inputs": [],
  "stateMutability": "nonpayable",
  "type": "constructor"
}, {
  "anonymous": false,
  "inputs": [{
    "indexed": true,
    "internalType": "address",
    "name": "owner",
    "type": "address"
  }, {
    "indexed": true,
    "internalType": "address",
    "name": "spender",
    "type": "address"
  }, {
    "indexed": false,
    "internalType": "uint256",
    "name": "amount",
    "type": "uint256"
  }],
  "name": "Approval",
  "type": "event"
}, {
  "anonymous": false,
  "inputs": [{
    "indexed": true,
    "internalType": "address",
    "name": "from",
    "type": "address"
  }, {
    "indexed": true,
    "internalType": "address",
    "name": "to",
    "type": "address"
  }, {
    "indexed": false,
    "internalType": "uint256",
    "name": "amount",
    "type": "uint256"
  }],
  "name": "Transfer",
  "type": "event"
}, {
  "inputs": [{
    "internalType": "address",
    "name": "owner",
    "type": "address"
  }, {
    "internalType": "address",
    "name": "spender",
    "type": "address"
  }],
  "name": "allowance",
  "outputs": [{
    "internalType": "uint256",
    "name": "",
    "type": "uint256"
  }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [{
    "internalType": "address",
    "name": "spender",
    "type": "address"
  }, {
    "internalType": "uint256",
    "name": "amount",
    "type": "uint256"
  }],
  "name": "approve",
  "outputs": [{
    "internalType": "bool",
    "name": "",
    "type": "bool"
  }],
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "inputs": [{
    "internalType": "address",
    "name": "owner",
    "type": "address"
  }],
  "name": "balanceOf",
  "outputs": [{
    "internalType": "uint256",
    "name": "balance",
    "type": "uint256"
  }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [],
  "name": "decimals",
  "outputs": [{
    "internalType": "uint256",
    "name": "",
    "type": "uint256"
  }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [],
  "name": "name",
  "outputs": [{
    "internalType": "string",
    "name": "",
    "type": "string"
  }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [],
  "name": "symbol",
  "outputs": [{
    "internalType": "string",
    "name": "",
    "type": "string"
  }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [],
  "name": "totalSupply",
  "outputs": [{
    "internalType": "uint256",
    "name": "",
    "type": "uint256"
  }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [{
    "internalType": "address",
    "name": "to",
    "type": "address"
  }, {
    "internalType": "uint256",
    "name": "amount",
    "type": "uint256"
  }],
  "name": "transfer",
  "outputs": [{
    "internalType": "bool",
    "name": "",
    "type": "bool"
  }],
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "inputs": [{
    "internalType": "address",
    "name": "from",
    "type": "address"
  }, {
    "internalType": "address",
    "name": "to",
    "type": "address"
  }, {
    "internalType": "uint256",
    "name": "amount",
    "type": "uint256"
  }],
  "name": "transferFrom",
  "outputs": [{
    "internalType": "bool",
    "name": "",
    "type": "bool"
  }],
  "stateMutability": "nonpayable",
  "type": "function"
}]