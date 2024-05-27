export interface FunctionCall {
    id: string, 
    funcName: string,
    arguements: Record<string, any> 
    result?: string 
}
