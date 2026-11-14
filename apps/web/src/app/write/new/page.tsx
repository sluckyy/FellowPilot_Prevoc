import { requirePageUser } from '@/lib/auth';
import { curriculumArea, emptyDraft } from '@/lib/core';
import { tutorAvailable } from '@/lib/tutor';
import { QuestionEditor } from '../QuestionEditor';

export const metadata = { title: 'New question' };
export const dynamic = 'force-dynamic';

export default async function NewQuestionPage({ searchParams }: { searchParams: { area?: string } }) {
  await requirePageUser();
  const area = searchParams.area && curriculumArea(searchParams.area) ? searchParams.area : '';
  return <QuestionEditor id={null} initial={emptyDraft(area)} declared={false} coaching={null} reviewNote="" coachAvailable={tutorAvailable()} />;
}
