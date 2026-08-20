# LLM-based duplicate detection without embeddings

Duplicate reports are checked by fetching every open issue in the Gitea repo and asking the
classifier's LLM, in a single structured-output call, to pick the best match (if any) plus a
confidence tier (`none`/`suspected`/`certain`) — not an embeddings/vector-similarity pipeline.

We picked this because the local demo repo only ever holds a handful of open issues, so there's no
accuracy or latency win from a real similarity search, and it keeps the dedup module to one API
call instead of an embedding + index + search stack.

This won't scale: once open issues no longer fit comfortably in one prompt's context, dedup needs
to move to embeddings-based candidate retrieval (pre-filter a shortlist, then let the LLM judge
it) instead of passing every open issue on every run.
