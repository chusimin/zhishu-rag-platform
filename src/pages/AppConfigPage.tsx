import { Navigate, useParams } from 'react-router-dom';

export function AppConfigPage() {
  const { id = '' } = useParams();
  return <Navigate to={`/studio?app=${id}`} replace />;
}
