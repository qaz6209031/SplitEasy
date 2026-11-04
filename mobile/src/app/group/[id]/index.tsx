import { useLocalSearchParams } from 'expo-router';

import { GroupDetail } from '@/features/GroupDetail';

export default function GroupScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  return <GroupDetail id={id} initialName={name} />;
}
