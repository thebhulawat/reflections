import express, {Request} from 'express'
import expressWs  from 'express-ws'
import {RawData, WebSocket} from 'ws'
import { LLMDummyMock, RetellRequest} from './agent/llmClient';


declare module 'express-serve-static-core' {
    interface Express extends Application {}
  }

const app = expressWs(express()).app;
const port = 3000;
const llmClient = new LLMDummyMock()

app.get('/', (req, res) => {
  res.send('Hello Express!');
});

app.ws('/llm-websocket/:call_id', async (ws: WebSocket, req: Request) => 
{
    const callId = req.params.call_id
    ws.on("error", (err) => {
        console.error(" Error in websocket connection", err);    
    })
    llmClient.BeginMessage(ws)
    ws.on("message", async (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        console.error("Got binary message instead of text in the stream")
        ws.close(1002, "Cannot find correponsing retell LLM")
      }
      try {
        const request = JSON.parse(data.toString())
        llmClient.DraftResponse(request, ws )

      } catch (err) {
        console.error("Error in parsing the incoming message", err)
        ws.close(1002, "Cannot parse the incoming message")
      }
    })
})

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});