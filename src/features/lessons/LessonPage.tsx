import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { lessonsById, tracksById, nextItem, itemUnlock, completedIds } from '@/content'
import { useProgress } from '@/features/progress/store'
import { Button, Chip, Confetti, Eyebrow, Icon, InlineMessage, Markdown } from '@/design-system/components'
import { NotFoundPage } from '@/app/NotFoundPage'
import { cn } from '@/design-system/cn'

/** Reading lesson with a short self-check. Completing the check unlocks the next item. */
export function LessonPage() {
  const { lessonId = '' } = useParams()
  // Keyed so answers and the "checked" state reset when the learner moves to another lesson.
  return <LessonView key={lessonId} lessonId={lessonId} />
}

function LessonView({ lessonId }: { lessonId: string }) {
  const lesson = lessonsById[lessonId]
  const labsProgress = useProgress((s) => s.labs)
  const lessonsProgress = useProgress((s) => s.lessons)
  const progress = { labs: labsProgress, lessons: lessonsProgress }
  const completeLesson = useProgress((s) => s.completeLesson)
  const navigate = useNavigate()
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [checked, setChecked] = useState(false)
  const [celebrate, setCelebrate] = useState(0)
  if (!lesson) return <NotFoundPage />
  const completed = completedIds(progress)
  if (!itemUnlock(lesson.id, completed).unlocked) return <Navigate to={`/tracks/${lesson.track}`} replace />
  const track = tracksById[lesson.track]!
  const lessonIndex = track.items.filter((i) => i.type === 'lesson').findIndex((i) => i.id === lesson.id)
  const done = completed.has(lesson.id)
  const next = nextItem(lesson.id)
  const allAnswered = lesson.quiz.every((_, i) => answers[i] !== undefined)
  const allCorrect = lesson.quiz.every((q, i) => answers[i] === q.answer)
  const correctCount = lesson.quiz.filter((q, i) => answers[i] === q.answer).length

  const check = () => {
    setChecked(true)
    if (!allCorrect) return
    const firstTime = !done
    completeLesson(lesson.id)
    if (firstTime) {
      setCelebrate((n) => n + 1)
      // Let the confetti play, then move on to the next step automatically.
      if (next) {
        const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-reduce-motion')
        window.setTimeout(() => navigate(next.href), reduce ? 700 : 1900)
      }
    }
  }

  return (
    <div className="mx-auto w-full max-w-[760px] px-6 pb-24 pt-12">
      <Confetti fire={celebrate} />
      <header>
        <Eyebrow>
          Lesson {String(lessonIndex + 1).padStart(2, '0')} · {track.title}
        </Eyebrow>
        <h1 className="mt-3 text-2xl font-medium leading-10 tracking-tight">{lesson.title}</h1>
        <p className="mt-4 max-w-[68ch] text-base leading-7 text-on-surface-variant">{lesson.summary}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wide text-on-surface-variant">
            <Icon name="schedule" size={16} /> {lesson.estimatedMinutes} min read
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wide text-on-surface-variant">
            <Icon name="fact_check" size={16} /> {lesson.quiz.length} question check
          </span>
          {done && (
            <Chip tone="success" icon="check">
              Completed
            </Chip>
          )}
        </div>
      </header>

      <article className="mt-12">
        {lesson.sections.map((s, i) => (
          <section key={i} aria-labelledby={`sec-${i}`} className={cn(i > 0 && 'mt-14')}>
            <Eyebrow>Part {String(i + 1).padStart(2, '0')}</Eyebrow>
            <h2 id={`sec-${i}`} className="mt-2 mb-3 text-lg font-medium leading-7 tracking-tight">
              {s.heading}
            </h2>
            <Markdown text={s.body} className="lesson-body" />
          </section>
        ))}
      </article>

      <hr className="my-14 border-outline" />

      {lesson.videos && lesson.videos.length > 0 && (
        <section className="rounded-lg border border-outline bg-surface p-5" aria-labelledby="videos">
          <Eyebrow>Watch, if you like</Eyebrow>
          <h2 id="videos" className="mt-1 text-base font-medium">
            Videos that explain the same ideas
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">Optional. They open on YouTube in a new tab; the lesson above has everything you need.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {lesson.videos.map((v) => (
              <li key={v.url}>
                <a
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-3 rounded-md border border-outline bg-background p-3 hover:border-primary hover:no-underline"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-error-container text-on-error-container">
                    <Icon name="play_arrow" size={20} filled />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-on-surface group-hover:text-primary">
                      <span className="truncate">{v.title}</span>
                      <Icon name="open_in_new" size={16} className="shrink-0 text-on-surface-variant" />
                    </span>
                    <span className="block text-xs text-on-surface-variant">
                      {v.channel ? `${v.channel} · ` : ''}YouTube{v.note ? ` · ${v.note}` : ''}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 rounded-lg border border-outline bg-background p-5" aria-labelledby="takeaways">
        <Eyebrow>Remember</Eyebrow>
        <h2 id="takeaways" className="sr-only">
          Key takeaways
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {lesson.takeaways.map((t, i) => (
            <li key={i} className="flex gap-2 text-sm leading-6">
              <Icon name="check" size={18} className="mt-0.5 text-success" />
              {t}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-lg border border-outline bg-background p-5" aria-labelledby="quiz">
        <div className="flex items-center justify-between">
          <div>
            <Eyebrow>Check yourself</Eyebrow>
            <h2 id="quiz" className="mt-1 text-base font-medium">
              {lesson.quiz.length} quick questions
            </h2>
          </div>
          {checked && (
            <span className={cn('font-mono text-xs', allCorrect ? 'text-success' : 'text-on-surface-variant')}>
              {correctCount}/{lesson.quiz.length} correct
            </span>
          )}
        </div>
        <ol className="mt-4 flex flex-col gap-5">
          {lesson.quiz.map((q, qi) => {
            const chosen = answers[qi]
            const isCorrect = checked && chosen === q.answer
            const isWrong = checked && chosen !== undefined && chosen !== q.answer
            return (
              <li key={qi}>
                <fieldset>
                  <legend className="text-sm font-medium">
                    {qi + 1}. {q.question}
                  </legend>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {q.options.map((opt, oi) => {
                      const selected = chosen === oi
                      return (
                        <label
                          key={oi}
                          className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm transition-standard',
                            selected ? 'border-primary bg-primary-container/50' : 'border-outline hover:bg-surface',
                            checked && selected && isCorrect && 'border-success bg-success-container/60',
                            checked && selected && isWrong && 'border-error bg-error-container/60',
                          )}
                        >
                          <input
                            type="radio"
                            name={`q-${qi}`}
                            value={oi}
                            checked={selected}
                            onChange={() => {
                              setAnswers((a) => ({ ...a, [qi]: oi }))
                              setChecked(false)
                            }}
                            className="mt-1 accent-primary"
                          />
                          <span>{opt}</span>
                        </label>
                      )
                    })}
                  </div>
                  {checked && chosen !== undefined && (
                    <p className={cn('mt-2 text-xs leading-5', isCorrect ? 'text-on-success-container' : 'text-on-error-container')}>
                      {isCorrect ? 'Correct. ' : 'Not quite. '}
                      {q.explanation}
                    </p>
                  )}
                </fieldset>
              </li>
            )
          })}
        </ol>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={check} disabled={!allAnswered} icon="fact_check">
            Check answers
          </Button>
          {checked && !allCorrect && <span className="text-sm text-on-surface-variant">Fix the ones marked, then check again.</span>}
        </div>
        {(done || (checked && allCorrect)) && (
          <InlineMessage
            tone="success"
            title="Lesson complete"
            className="mt-5"
            action={
              next ? (
                <Link to={next.href} className="hover:no-underline">
                  <Button size="sm" variant="tonal" trailingIcon="arrow_forward" tabIndex={-1}>
                    {next.type === 'lab' ? 'Start lab' : 'Next lesson'}: {next.title}
                  </Button>
                </Link>
              ) : undefined
            }
          >
            {next ? `Opening the next step: ${next.title}.` : 'You have finished every available item.'}
          </InlineMessage>
        )}
      </section>
    </div>
  )
}
