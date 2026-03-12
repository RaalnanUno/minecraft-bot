Phase 3 should be:

# **Controlled world actions**

This is where the bot stops being just:

* chat AI
* movement AI

and starts actually **doing Minecraft work**.

## Recommended Phase 3 scope

Keep it to **one real task** first.

Best first options:

* `bot cut tree`
* `bot dig dirt`
* `bot mine stone`

Of those, I recommend:

# **Phase 3 = `bot cut tree`**

Why this is the best next step:

* very visual
* easy to test
* feels like real AI
* teaches targeting, movement, digging, and simple task flow
* much easier than “build a house”

---

## What Phase 3 would introduce

You’d add the ability to:

1. find a nearby log block
2. walk to it
3. dig the log
4. repeat for connected logs
5. stop when done
6. report back in chat

That gives you your first **real autonomous task**.

---

## Suggested branch name

```text
feature/minecraft-bot-phase-3-cut-tree
```

---

## Suggested files

If you want to start organizing the project a bit better, this is a good point to split things up.

### Minimal approach

Keep working in:

* `bot.js`

### Better approach

Start introducing:

* `bot.js`
* `actions/cutTree.js`

Since you like structured project layouts, I’d lean toward the second option.

---

## What comes after Phase 3

A sensible roadmap would be:

### Phase 4

**Continuous follow**

* `bot follow me`
* keeps updating target as you move

### Phase 5

**Basic gathering**

* `bot gather wood`
* `bot dig dirt`
* `bot mine coal`

### Phase 6

**Placement/building**

* `bot place block`
* `bot build hut`

### Phase 7

**Ollama as task planner**
Instead of only hardcoded commands, Ollama could return structured actions like:

```json
{ "action": "cut_tree" }
```

and your bot executes them.

That’s the point where it starts feeling like a real agent.

---

## My recommendation

Do **Phase 3: cut tree** before anything else.

It’s the best balance of:

* useful
* cool
* achievable
* not too much code at once

If you want, I can make the next step exactly like last time:
a **single markdown backlog-style file** with

* branch name
* files to edit
* install needs
* full code
* test steps
* commit message
