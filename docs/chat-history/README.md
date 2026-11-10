# Chat history

Append-only record of every exchange with an AI agent on this repository, written by the owner's claude-chat-history hooks. This repository opts in through [.claude/chat-history.json](../../.claude/chat-history.json).

## Local only

Week files (`YYYY-Www.md`), the `.pending/` folder and the `.lock` file are git-ignored and must never be committed: prompts are kept word for word and can contain secrets. This README is the only tracked file in this folder. The hooks refuse to write anything that git does not ignore.

## How entries are written

- **Session start:** the hook gives the agent the summary instructions and the latest entries, newest first, within 8,000 characters.
- **Prompt:** the hook saves the prompt word for word, with its time and the session id, as a turn record in `.pending/<session id>/`.
- **End of turn:** before ending its turn, the agent writes `.pending/<session id>.summary.json`. The hook validates it, appends the numbered entry to the current week file and deletes the pending files. If the summary is missing or invalid, the hook sends the agent back once, then writes the entry marked "summary missing".
- Numbering is global across week files. Entries [1] to [5] were written by hand; later ones before this opt-in were written by an earlier session with the same writer the hooks use.

## Summary file

A JSON object with five keys:

```json
{
  "title": "One line",
  "from": "owner",
  "assistant": "What the agent answered and did",
  "filesChanged": "Files changed, or none",
  "decisions": ["Decisions or context for future agents"]
}
```

`from` is `owner` when the owner typed the prompt, or `automated (<what kind>)` for a task notification, a scheduled task or a message from another session.

## Entry format

````text
## [N] YYYY-MM-DD HH:MM — <title>
**From:** owner | automated (<what kind>)
**Session:** <Claude Code session id>
**User:**
```text
<prompt, word for word>
```
**Assistant:** <summary of the answer and actions taken>
**Files changed:** <list or "none">
**Decisions / context for future agents:**
- <decision>
````

## Without the hooks

An agent in a tool that does not run Claude Code hooks (for example Cursor) appends its entries by hand, in the same format, to the current week file, continuing the numbering. It writes `**Session:** none (written by hand)`.

## Rules

- Append only: entries are never rewritten or deleted, except by a move the owner orders.
- A session logs into the project it was opened in. Work on another project belongs in a session opened in that project, so its turns land in that project's log.
