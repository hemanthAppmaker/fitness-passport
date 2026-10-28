import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Chip, Empty, ErrorNote, Loading, Screen } from '../../components/ui';
import { acceptConnection, discoverPeople, getConnections, requestConnection } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { colors, radius, type } from '../../lib/theme';
import { useAsync } from '../../lib/useAsync';

function Card({ children }: { children: React.ReactNode }) {
  return <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, gap: 10 }}>{children}</View>;
}

export default function PeopleTab() {
  const { userId } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error, refetch } = useAsync(async () => {
    const [people, connections] = await Promise.all([discoverPeople(), getConnections()]);
    return { people, connections };
  }, [userId]);

  async function act(key: string, fn: () => Promise<void>) {
    setBusyId(key);
    setActionError(null);
    try {
      await fn();
      await refetch();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  const incoming = data?.connections.filter((c) => c.status === 'pending' && c.addressee_id === userId) ?? [];
  const partners = data?.connections.filter((c) => c.status === 'accepted') ?? [];
  const sent = data?.connections.filter((c) => c.status === 'pending' && c.requester_id === userId) ?? [];

  return (
    <Screen onRefresh={refetch}>
      <Text style={type.display}>People</Text>
      <ErrorNote message={actionError ?? error} />

      {loading && !data ? (
        <Loading />
      ) : (
        <>
          {incoming.length > 0 && (
            <View style={{ gap: 10 }}>
              <Text style={type.title}>Requests</Text>
              {incoming.map((c) => (
                <Card key={c.id}>
                  <Text style={[type.body, { fontWeight: '700' }]}>{c.requester.display_name}</Text>
                  <Text style={type.small}>wants to be your training partner</Text>
                  <Button label="Accept" busy={busyId === c.id} onPress={() => act(c.id, () => acceptConnection(c.id))} />
                </Card>
              ))}
            </View>
          )}

          {partners.length > 0 && (
            <View style={{ gap: 10 }}>
              <Text style={type.title}>Your partners ({partners.length})</Text>
              {partners.map((c) => {
                const other = c.requester_id === userId ? c.addressee : c.requester;
                return (
                  <Card key={c.id}>
                    <Text style={[type.body, { fontWeight: '700' }]}>{other.display_name}</Text>
                    {other.city && <Text style={type.small}>{other.city}</Text>}
                  </Card>
                );
              })}
            </View>
          )}

          <View style={{ gap: 10 }}>
            <Text style={type.title}>People on similar paths</Text>
            {data?.people.length === 0 ? (
              <Empty
                title="No one here yet"
                body="Join a challenge and add your goals in your passport. People who share them will show up here."
              />
            ) : (
              data?.people.map((p) => {
                const alreadySent = sent.some((c) => c.addressee_id === p.id);
                return (
                  <Card key={p.id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={[type.body, { fontWeight: '700' }]}>{p.display_name}</Text>
                      {p.city && <Text style={type.small}>{p.city}</Text>}
                    </View>
                    {p.shared_challenges.length > 0 ? (
                      <Text style={type.small}>Also doing {p.shared_challenges.join(', ')}</Text>
                    ) : (
                      <Text style={type.small}>New to the passport</Text>
                    )}
                    {p.goals.length > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {p.goals.map((g) => (
                          <Chip key={g} label={g} />
                        ))}
                      </View>
                    )}
                    <Button
                      variant="secondary"
                      label={alreadySent ? 'Request sent' : 'Connect'}
                      disabled={alreadySent}
                      busy={busyId === p.id}
                      onPress={() => act(p.id, () => requestConnection(userId!, p.id))}
                    />
                  </Card>
                );
              })
            )}
          </View>
        </>
      )}
    </Screen>
  );
}
