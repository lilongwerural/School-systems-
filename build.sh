#!/bin/bash
# Generate env-config.js from Vercel environment variables at build time
echo "window.ENV_SUPABASE_URL = '${SUPABASE_URL}';" > env-config.js
echo "window.ENV_SUPABASE_ANON_KEY = '${SUPABASE_ANON_KEY}';" >> env-config.js
echo "env-config.js generated successfully"
cat env-config.js
