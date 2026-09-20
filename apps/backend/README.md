# Backend architecture

Italian Pizza uses Supabase PostgreSQL/Auth/Storage as its persistent backend.
Versioned SQL lives in `/supabase`. Runtime commands live in the customer and
admin Next.js route handlers, close to their session/caching boundaries.
Cross-application contracts and pure business rules live in `/packages/shared`.

This package intentionally does not start a second always-on HTTP service.
