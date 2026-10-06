export const models = {
  "groq:gpt-oss-120b": {provider:"groq",providerModelId:"openai/gpt-oss-120b",status:"production",freeEligible:true,paidRequired:false,context:131072,structuredOutput:true,tools:true,reasoning:true,reviewedAt:"2026-10-06"},
  "groq:gpt-oss-20b": {provider:"groq",providerModelId:"openai/gpt-oss-20b",status:"production",freeEligible:true,paidRequired:false,context:131072,structuredOutput:true,tools:true,reasoning:true,reviewedAt:"2026-10-06"},
  "groq:whisper-large-v3-turbo": {provider:"groq",providerModelId:"whisper-large-v3-turbo",status:"production",freeEligible:true,paidRequired:false,audioIn:true,reviewedAt:"2026-10-06"}
} as const;
