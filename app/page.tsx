import { redirect } from "next/navigation";

/**
 * The agent's entry point is the queue, per the workflow described in
 * `PROJECT_BRIEF.md` (Sarah Chen): "an agent pulls up an application,
 * looks at the label artwork…". `/` redirects so the deployed root URL
 * lands every reviewer in their pending list.
 */
export default function Home() {
  redirect("/queue");
}
