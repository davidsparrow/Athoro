import { z } from "zod";

/** Kinds of work Authoro registers. Text first, with media types reserved for later. */
export const WORK_TYPES = {
  article: "Article",
  essay: "Essay",
  "blog-post": "Blog post",
  newsletter: "Newsletter issue",
  "book-chapter": "Book chapter",
  book: "Book",
  "research-paper": "Research paper",
  thesis: "Thesis or dissertation",
  "course-lesson": "Course lesson",
  "short-story": "Short story",
  poem: "Poem",
  script: "Script or screenplay",
  speech: "Speech or talk",
  documentation: "Documentation",
  code: "Code",
  image: "Image",
  audio: "Audio",
  video: "Video",
  other: "Other",
} as const;

export type WorkType = keyof typeof WORK_TYPES;
export const workTypeSchema = z.enum(Object.keys(WORK_TYPES) as [WorkType, ...WorkType[]]);
