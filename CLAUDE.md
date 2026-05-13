@AGENTS.md

# YES Vancity — AI-Powered Student Exchange Agency Management

## Quick Reference

- **Stack**: Next.js 15 App Router, TypeScript, Tailwind CSS, Supabase (Postgres + Auth + RLS)
- **AI models**: Claude Haiku (`claude-haiku-4-5-20251001`) for fast responses, Sonnet for complex tasks
- **Dev server**: `npm run dev` on port 3001
- **Type check**: `npx tsc --noEmit`
- **GitHub**: `https://github.com/caltagonz-tech/yesvan`

## Architecture

### Route Groups
- `src/app/(desktop)/d/*` — Desktop UI (data sheets, settings, calendar, email)
- `src/app/(mobile)/m/*` — Mobile UI (action cards, processes, intake, capture)
- `src/app/(auth)/*` — Login/signup
- `src/app/api/*` — API routes (server-side, uses Supabase server client)

### Key API Routes
| Route | Purpose | Handlers |
|-------|---------|----------|
| `api/ai/route.ts` | Main AI endpoint | greeting, rankCards, prioritizeCards, processCapture, intakeStep, chat, cardAssist |
| `api/process-assist/route.ts` | Process/checklist AI | status, step_help, fill_step, complete_step, render_email |
| `api/ai-prompts/route.ts` | CRUD for AI prompt templates | GET (list), POST (save), DELETE (reset) |
| `api/email/route.ts` | Roundcube email proxy | list, read, send, delete |
| `api/test-setup/route.ts` | Dev seeding | GET (check tables), POST (seed user + definitions + student + cards) |

### Key Pages
| Path | File | Purpose |
|------|------|---------|
| `/m` | `(mobile)/m/page.tsx` | Mobile home: greeting, energy chips, action cards |
| `/m/process/[studentId]/[processName]` | `(mobile)/m/process/.../page.tsx` | Process checklist with data-aware step fields |
| `/m/card/[id]` | `(mobile)/m/card/[id]/page.tsx` | Card detail with AI conversation |
| `/m/intake` | `(mobile)/m/intake/page.tsx` | AI-guided intake conversation |
| `/d/students` | `(desktop)/d/students/page.tsx` | Students data sheet |
| `/d/hosts` | `(desktop)/d/hosts/page.tsx` | Host families data sheet |
| `/d/processes` | `(desktop)/d/processes/page.tsx` | Desktop process definitions editor |
| `/d/checklists` | `(desktop)/d/checklists/page.tsx` | Desktop checklists view |
| `/d/settings` | `(desktop)/d/settings/page.tsx` | Settings: profile, AI prompts editor, display prefs |

### Shared Types & Logic
| File | What |
|------|------|
| `src/types/process.ts` | `StepDefinition`, `StepField`, `ProcessStepData`, `resolveVisibleSteps()`, `renderTemplate()`, `prefillFields()` |
| `src/lib/pii.ts` | PII anonymization: display IDs (STU-XXX, HOST-XX, DRV-XX, UNI-XX) |
| `src/lib/supabase/client.ts` | Browser Supabase client |
| `src/lib/supabase/server.ts` | Server Supabase client (cookies) |
| `src/components/desktop/DataSheet.tsx` | Reusable data sheet component (used by students, hosts, drivers, universities, leads) |

### Supabase Tables
- `users` — team members (FK to auth.users)
- `students` — student records with display_id STU-XXX
- `host_families` — host family records (HOST-XX)
- `drivers` — airport drivers (DRV-XX)
- `universities` — partner schools (UNI-XX)
- `potential_students` — leads
- `action_cards` — task cards for mobile UI
- `process_definitions` — versioned process templates (JSONB `definition.steps[]`)
- `student_process_state` — per-student process progress
- `process_step_data` — per-step field values (`field_values` JSONB)
- `ai_prompt_templates` — custom AI prompt overrides
- `notifications` — push notifications

### Process System (v3)
- Steps have `fields[]` with types: text, select, date, boolean, number, entity_picker, email, phone, textarea
- Each field can have `target_table` + `target_column` for write-back to source records
- `prefill_from` pulls data from entity map (e.g., `student.english_level`)
- Email steps have `email_template` with `{{entity.field}}` placeholders
- Decision steps (`step_type: "decision"`) branch via `active_branches`
- Definitions: academic_placement, homestay_intake, airport_arrival, airport_departure, custodianship

## Conventions

- **PII**: All AI calls use anonymized display IDs. `src/lib/pii.ts` handles mapping.
- **ADHD-aware UX**: No counts/numbers in greetings, no shame language, one suggestion at a time.
- **AI prompts**: Stored in `DEFAULT_PROMPTS` in `api/ai-prompts/route.ts`, overridable via DB.
- **Migrations**: `supabase/migrations/` numbered 001-023. Run in Supabase SQL Editor.
- **Auth user**: Must exist in both `auth.users` AND `public.users` table.
- **RLS**: All tables have Row Level Security. Authenticated users can read all, write own.

## Common Tasks

**Add a new field to a process step**: Edit the process definition JSON in migration or via desktop editor. Add the field to the `fields[]` array with key, label, type, required, and optionally target_table/target_column.

**Add a new AI prompt**: Add to `DEFAULT_PROMPTS` in `src/app/api/ai-prompts/route.ts`, then use `getPrompt(supabase, "key")` in the handler.

**Add a new data sheet column**: Update the Supabase migration, then add the column config to the desktop page's `columns` array (uses `DataSheet.tsx` component).

**Add a new API handler in ai/route.ts**: Add a new case in the action switch, create a `handleXxx` function, use `getPrompt`/`getSystemPrompt` for AI calls.
