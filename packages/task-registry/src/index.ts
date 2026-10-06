export type TaskDefinition={id:string;app:string;modality:"text"|"vision"|"audio"|"image"|"embedding";defaultSensitivity:"P0_PUBLIC"|"P1_INTERNAL"|"P2_PERSONAL"|"P3_SENSITIVE"|"P4_RESTRICTED";allowedProviders:string[];blockedProviders:string[];streaming:boolean};
export const tasks:TaskDefinition[]=[
{id:"connect.reply.suggest",app:"connect",modality:"text",defaultSensitivity:"P2_PERSONAL",allowedProviders:["groq","cloudflare"],blockedProviders:["gemini-free"],streaming:true},
{id:"finance.receipt.extract",app:"nestfinance",modality:"vision",defaultSensitivity:"P3_SENSITIVE",allowedProviders:["cloudflare"],blockedProviders:["gemini-free","mistral-lab"],streaming:false},
{id:"nestlume.study.answer",app:"nestlume",modality:"text",defaultSensitivity:"P1_INTERNAL",allowedProviders:["groq","cloudflare"],blockedProviders:[],streaming:true},
{id:"affiliate.pin.copy",app:"nestaffiliate",modality:"text",defaultSensitivity:"P0_PUBLIC",allowedProviders:["groq","cloudflare","gemini-free"],blockedProviders:[],streaming:false}
];
