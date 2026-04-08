export default function HomePage() {
  return (
    <main>
      <h1>HUB Chat - Omnichannel MVP</h1>
      <p>Minimal Next.js shell is active.</p>

      <div className="card">
        <h2>API Endpoints</h2>
        <ul>
          <li>`GET /api/leads`</li>
          <li>`GET /api/leads/{`{id}`}` + `PATCH /api/leads/{`{id}`}`</li>
          <li>`POST /api/leads/{`{id}`}/assign`</li>
          <li>`GET /api/conversations`</li>
          <li>`POST /api/messages/send`</li>
          <li>`GET /api/dashboard/metrics`</li>
        </ul>
      </div>

      <div className="card">
        <h2>Auth</h2>
        <p>
          Include `Authorization: Bearer &lt;supabase_access_token&gt;` and `x-tenant-id: &lt;tenant_uuid&gt;` on every API
          request.
        </p>
      </div>
    </main>
  );
}
