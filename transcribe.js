import "https://deno.land/x/dotenv@v3.2.0/load.ts";
import axios from "https://deno.land/x/axiod/mod.ts";
import * as fs from "https://deno.land/std@0.141.0/fs/mod.ts";

const TOKEN = Deno.env.get("ASSEMBLYAI_TOKEN")

if (TOKEN == "") {
    console.error("ASSEMBLYAI_TOKEN must be set in environment or in .env")
    Deno.exit(1)
}

// foo
// bar
// baz
// -> [ "foo", "bar", "baz" ]
const customVocab = (await Deno.readTextFile('custom_vocab.txt')).trim().split('\n')

if (Deno.args.length != 1) {
    console.error("Please provide one argument: the path to the file to upload.")
    Deno.exit(1)
}

console.log("Loading audio file to memory...")

const audioUpload = await Deno.readFile(Deno.args[0])

console.log("Uploading audio file to AssemblyAI...")

const uploadResp = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: {
      authorization: TOKEN,
      "content-type": "application/json",
      "transfer-encoding": "chunked",
    },
    body: audioUpload
})
const uploadRespJson = await uploadResp.json()

const uploadURL = uploadRespJson.upload_url

let assembly = axios.create({
    baseURL: "https://api.assemblyai.com/v2",
    headers: {
        authorization: TOKEN,
        "content-type": "application/json",
    },
});

console.log("Transcribing file using AssemblyAI...")

const transcriptionResp = await assembly.post("/transcript", {
        audio_url: uploadURL,
        speaker_labels: true,
        word_boost: customVocab
    }).catch(err => console.error(err) && Deno.exit(1))

const transcriptionId = transcriptionResp.data.id
let transcription = transcriptionResp.data

let status = transcriptionResp.data.status

const retrySeconds = 3

while (status != "completed" && status != "error") {
    let statusResp = await assembly.get(`/transcript/${transcriptionId}`)

    transcription = statusResp.data
    status = transcription.status

    console.log(`Waiting on transcription. Status: ${status}. Checking again in ${retrySeconds} seconds...`)

    await new Promise(resolve => setTimeout(resolve, retrySeconds * 1000));
}

if (status == "error") {
    console.log("Error:")
    console.log(transcription)
    Deno.exit(1)
}

await Deno.writeTextFile('transcription.json', JSON.stringify(transcription));

let mdOutput = ""

transcription.utterances.forEach(u => mdOutput += `**Speaker ${u.speaker}:** ${u.text}\n\n`)

await Deno.writeTextFile('transcription.md', mdOutput)

console.log(mdOutput)