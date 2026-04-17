const { createClient } = require("@supabase/supabase-js");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      out[key] = "true";
      continue;
    }
    out[key] = value;
    i += 1;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = args["supabase-url"];
  const serviceRoleKey = args["service-role-key"];
  const commentId = args["comment-id"];

  if (!supabaseUrl || !serviceRoleKey || !commentId) {
    throw new Error("Missing required args: --supabase-url --service-role-key --comment-id");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: messageRows, error: messageError } = await supabase
    .from("messages")
    .select("id,conversation_id,external_message_id,created_at")
    .eq("channel_type", "FACEBOOK")
    .eq("external_message_id", commentId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (messageError) throw messageError;
  if (!messageRows || messageRows.length === 0) {
    throw new Error(`Comment not found in messages: ${commentId}`);
  }

  const message = messageRows[0];
  const { data: conversationRow, error: conversationError } = await supabase
    .from("conversations")
    .select("id,lead_id,channel_thread_id,last_message_at")
    .eq("id", message.conversation_id)
    .single();

  if (conversationError) throw conversationError;
  if (!conversationRow) {
    throw new Error(`Conversation not found: ${message.conversation_id}`);
  }

  process.stdout.write(
    JSON.stringify(
      {
        commentId,
        leadId: conversationRow.lead_id,
        conversationId: conversationRow.id,
        channelThreadId: conversationRow.channel_thread_id,
        messageId: message.id,
        messageCreatedAt: message.created_at
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err.message ?? String(err));
  process.exit(1);
});
