import { initializeKeypair } from "./initializeKeypair"
import {
  Connection,
  clusterApiUrl,
  Transaction,
  sendAndConfirmTransaction,
  Keypair,
  SystemProgram,
} from "@solana/web3.js"
import {
  createInitializeMintInstruction,
  getMinimumBalanceForRentExemptMint,
  getAssociatedTokenAddress,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  Account,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
  getAccount,
  createMintToInstruction,
} from "@solana/spl-token"
import {
  Metaplex,
  keypairIdentity,
  bundlrStorage,
  toMetaplexFile,
  findMetadataPda,
} from "@metaplex-foundation/js"
import {
  DataV2,
  createCreateMetadataAccountV2Instruction,
} from "@metaplex-foundation/mpl-token-metadata"
import * as fs from "fs"

const tokenName = "Sage Coin"
const description = "Description"
const symbol = "SGC"
const decimals = 2
const amount = 1

async function main() {
  const connection = new Connection(clusterApiUrl("devnet"))
  const user = await initializeKeypair(connection)

  console.log("PublicKey:", user.publicKey.toBase58())

  // rent for token mint
  const lamports = await getMinimumBalanceForRentExemptMint(connection)

  // keypair for new token mint
  const mintKeypair = Keypair.generate()

  // get metadata PDA for token mint
  const metadataPDA = await findMetadataPda(mintKeypair.publicKey)

  // get associated token account address for use
  const tokenATA = await getAssociatedTokenAddress(
    mintKeypair.publicKey,
    user.publicKey
  )

  // metaplex setup
  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(user))
    .use(
      bundlrStorage({
        address: "https://devnet.bundlr.network",
        providerUrl: "https://api.devnet.solana.com",
        timeout: 60000,
      })
    )

  const buffer = fs.readFileSync("src/test.png")

  
  const file = toMetaplexFile(buffer, "test.png")


  const imageUri = await metaplex.storage().upload(file)
  console.log("image uri:", imageUri)


  const { uri } = await metaplex
    .nfts()
    .uploadMetadata({
      name: tokenName,
      description: description,
      image: imageUri,
    })
    

  console.log("metadata uri:", uri)


  const tokenMetadata = {
    name: tokenName,
    symbol: symbol,
    uri: uri,
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null,
  } as DataV2


  const transaction = new Transaction().add(

    SystemProgram.createAccount({
      fromPubkey: user.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: MINT_SIZE,
      lamports: lamports,
      programId: TOKEN_PROGRAM_ID,
    }),

    createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      user.publicKey,
      user.publicKey,
      TOKEN_PROGRAM_ID
    ),

    createCreateMetadataAccountV2Instruction(
      {
        metadata: metadataPDA,
        mint: mintKeypair.publicKey,
        mintAuthority: user.publicKey,
        payer: user.publicKey,
        updateAuthority: user.publicKey,
      },
      {
        createMetadataAccountArgsV2: {
          data: tokenMetadata,
          isMutable: true,
        },
      }
    )
  )


  const createTokenAccountInstruction = createAssociatedTokenAccountInstruction(
    user.publicKey, // payer
    tokenATA, // token address
    user.publicKey, // token owner
    mintKeypair.publicKey // token mint
  )

  let tokenAccount: Account
  try {

    tokenAccount = await getAccount(
      connection, // connection
      tokenATA // token address
    )
  } catch (error: unknown) {
    if (
      error instanceof TokenAccountNotFoundError ||
      error instanceof TokenInvalidAccountOwnerError
    ) {
      try {

        transaction.add(createTokenAccountInstruction)
      } catch (error: unknown) {}
    } else {
      throw error
    }
  }

  transaction.add(

    createMintToInstruction(
      mintKeypair.publicKey,
      tokenATA,
      user.publicKey,
      amount * Math.pow(10, decimals)
    )
  )

  
  const transactionSignature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [user, mintKeypair]
  )

  console.log(
    `Transaction: https://explorer.solana.com/tx/${transactionSignature}?cluster=devnet`
  )
}

main()
  .then(() => {
    console.log("Finished successfully")
    process.exit(0)
  })
  .catch((error) => {
    console.log(error)
    process.exit(1)
  })