import { requireChatGPTUser } from "./chatgpt-auth";
import Library from "./library";
export const dynamic="force-dynamic";
export default async function Home(){const user=await requireChatGPTUser("/");return <Library initial={(user.email??"M").slice(0,1).toUpperCase()}/>;}
