# Kitchen display guide

Kitchen staff sign in with the KITCHEN role and open `/kitchen`. Confirmed tickets appear in **Queued**; preparing tickets appear in **Cooking**. The board subscribes to Supabase Realtime and also refreshes every 15 seconds if the connection is unavailable.

Each ticket prioritizes the daily token, service type, elapsed time, items, modifiers and preparation notes. Warning and late states include text/icon treatment as well as color. Use **Start preparing** and **Mark ready**; the database rejects illegal transitions and stores timestamps. Kitchen tickets can be printed without prices by default.

Keep the display awake and signed in during service. If the connection indicator falls back to polling, operations continue but updates may take up to 15 seconds. Station routing and preparation-time prediction are future extensions; current tickets use one shared kitchen queue.
