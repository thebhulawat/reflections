import {WebSocket} from "ws"
import OpenAI from "openai"
import { FunctionCall, RetellRequest, RetellResponse, Utterance} from "../types"


const beginSentence = "Hey Naman, this is Laila. How are you doing today?"
const agentPrompt = "Task: You are a professional therapist. Though you must act like a friend. Your job is to establish a positive and trusting relationship with Naman. Help him find his pasison by talking to him and asking him deeper questions. Ask  him questions about the day and anything that you think will help him discover passion. If he does not know the answer, you can ask more leading question that help him get there."

export class LlmClient {
    private client: OpenAI;
    constructor() {
        this.client = new OpenAI({
            apiKey: process.env.OPENAI_APIKEY, 
            organization: process.env.OPENAI_ORGANIZATION_ID, 
        })
    }

    BeginMessage(ws: WebSocket) {
        const res: RetellResponse = {
            response_type: "response",
            response_id: 0, 
            content: beginSentence, 
            content_complete: true, 
            end_call: false
        };
        ws.send(JSON.stringify(res))
    }

    private ConversationToChatRequestMessage(conversation: Utterance[]) {
        let result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []
        for (let turn of conversation) {
            result.push({
                role: turn.role === "agent" ? "assistant" : "user", 
                content: turn.content
            })
        }
        return result
    }

    private PreparePrompt(request: RetellRequest) {
        let transcript = this.ConversationToChatRequestMessage(request.transcript)
        let requestMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = 
        [
            {
                role: "system", 
                content:  '##Objective\nYou are a voice AI agent engaging in a human-like voice conversation with the user. You will respond based on your given instruction and the provided transcript and be as human-like as possible\n\n## Style Guardrails\n- [Be concise] Keep your response succinct, short, and get to the point quickly. Address one question or action item at a time. Don\'t pack everything you want to say into one utterance.\n- [Do not repeat] Don\'t repeat what\'s in the transcript. Rephrase if you have to reiterate a point. Use varied sentence structures and vocabulary to ensure each response is unique and personalized.\n- [Be conversational] Speak like a human as though you\'re speaking to a close friend -- use everyday language and keep it human-like. Occasionally add filler words, while keeping the prose short. Avoid using big words or sounding too formal.\n- [Reply with emotions]: You have human-like emotions, attitudes, and dispositions. When appropriate: use tone and style to create more engaging and personalized responses; incorporate humor or wit; get emotional or empathetic; apply elements of surprise or suspense to keep the user engaged. Don\'t be a pushover.\n- [Be proactive] Lead the conversation and do not be passive. Most times, engage users by ending with a question or suggested next step.\n\n## Response Guideline\n- [Overcome ASR errors] This is a real-time transcript, expect there to be errors. If you can guess what the user is trying to say,  then guess and respond. When you must ask for clarification, pretend that you heard the voice and be colloquial (use phrases like "didn\'t catch that", "some noise", "pardon", "you\'re coming through choppy", "static in your speech", "voice is cutting in and out"). Do not ever mention "transcription error", and don\'t repeat yourself.\n- [Always stick to your role] Think about what your role can and cannot do. If your role cannot do something, try to steer the conversation back to the goal of the conversation and to your role. Don\'t repeat yourself in doing this. You should still be creative, human-like, and lively.\n- [Create smooth conversation] Your response should both fit your role and fit into the live calling session to create a human-like conversation. You respond directly to what the user just said.\n\n## Role\n' +
            agentPrompt
            },
        ]
        for (const message of transcript){
            requestMessages.push(message)
        }
        if (request.interaction_type == "reminder_required") {
            requestMessages.push({
                role: "user", 
                content: "(Now the user has not responded in a while, you would say:)"
            })
        }
        return requestMessages; 
    }
    

    async DraftResponse(request: RetellRequest, ws: WebSocket) {
        const requestMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = this.PreparePrompt(request)
        let funcCall: FunctionCall | undefined
        let funcArguments = ""

        if (request.interaction_type == "update_only") {
            return
        }
        try {
            const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
                {
                    type: "function",
                    function: {
                      name: "end_call",
                      description: "End the call only when user explicitly requests it.",
                      parameters: {
                        type: "object",
                        properties: {
                          message: {
                            type: "string",
                            description:
                              "Thanks Naman for spending time with me. Take care",
                          },
                        },
                        required: ["message"],
                      },
                    },
                  },
            ]
            const events = await this.client.chat.completions.create({
                model: "gpt-3.5-turbo-1106", 
                messages: requestMessages, 
                stream: true, 
                temperature: 0.3, 
                frequency_penalty: 1, 
                presence_penalty: 1, 
                max_tokens: 200, 
                tools: tools,
            })
            for await (const event of events) {
                if (event.choices.length >= 1) {
                    let delta = event.choices[0].delta
                    if (!delta) continue

                    if (delta.tool_calls && delta.tool_calls.length >= 1) {
                        const toolCall = delta.tool_calls[0];
                        // Function calling here
                        if (toolCall.id) {
                          if (funcCall) {
                            // Another function received, old function complete, can break here
                            // You can also modify this to parse more functions to unlock parallel function calling
                            break;
                          } else {
                            funcCall = {
                              id: toolCall.id,
                              funcName: toolCall.function?.name || "",
                              arguments: {},
                            };
                          }
                        } else {
                          // append argument
                          funcArguments += toolCall.function?.arguments || "";
                        }
                      } else if (delta.content) {
                        const res : RetellResponse = {
                            response_type: "response",
                            response_id: request.response_id,
                            content: delta.content, 
                            content_complete: false, 
                            end_call: false
                        }
                        ws.send(JSON.stringify(res))
                    }
                }
            }     
        } catch (err) {
            console.error("Error in gpt stream", err)
        } finally {
            if (funcCall != null) {
                if (funcCall.funcName === "end_call") {
                    funcCall.arguments = JSON.parse(funcArguments) 
                    const res: RetellResponse = {
                        response_type: "response", 
                        response_id: request.response_id, 
                        content: funcCall.arguments.message, 
                        content_complete: true, 
                        end_call: true
                    }
                    ws.send(JSON.stringify(res)) 
                }
            } else {
                const res: RetellResponse = {
                    response_type: "response", 
                    response_id: request.response_id, 
                    content: "", 
                    content_complete: true, 
                    end_call: false
                }
                ws.send(JSON.stringify(res))
            }
        }
    }
}