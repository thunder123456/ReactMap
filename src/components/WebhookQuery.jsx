import React from 'react'
import { useQuery } from '@apollo/client'

import Query from '@services/Query'
import Container from './Container'

export default function WebhookQuery({ params, serverSettings, location, zoom }) {
  let lowercase = params.category.toLowerCase()
  if (lowercase === 'invasions'
    || lowercase === 'lures'
    || lowercase === 'quests') {
    lowercase = 'pokestops'
  }
  if (lowercase === 'raids') {
    lowercase = 'gyms'
  }
  const { data } = useQuery(Query[lowercase]('id'), {
    variables: {
      id: params.id,
      perm: params.category.toLowerCase(),
      version: inject.VERSION,
    },
  })
  return data ? (
    <Container
      location={data[`${lowercase}Single`]
        ? [data[`${lowercase}Single`].lat, data[`${lowercase}Single`].lon]
        : location}
      zoom={params.zoom || zoom}
      params={params}
      serverSettings={serverSettings}
    />
  ) : null
}
