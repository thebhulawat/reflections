export interface FunctionCall {
    id: string, 
    funcName: string,
    arguments: Record<string, any> 
    result?: string 
}

export interface Utterance {
    role: "agent" | "user", 
    content: string
}

export interface RetellRequest {
    response_id?: number, 
    transcript: Utterance[],
    interaction_type: "update_only" | "response_required" | "reminder_required" 
}

export interface RetellResponse {
    response_type: "response",
    response_id?: number, 
    content: string, 
    content_complete: boolean, 
    end_call: boolean 
}
