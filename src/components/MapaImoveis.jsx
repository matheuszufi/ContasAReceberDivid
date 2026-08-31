import React, { useEffect, useRef } from 'react'

// --- Mapa de imóveis (Leaflet + OpenStreetMap) ---
// Pré-requisito: `npm install leaflet` no projeto.
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

// Corrige o caminho padrão dos ícones do Leaflet, que quebra com bundlers (Vite/CRA/Webpack)
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const BRASIL_CENTER = [-15.793889, -47.882778] // Brasília, usado como centro inicial

// Monta a string de busca de endereço a partir do objeto `endereco` salvo no imóvel
export const buildEnderecoQuery = (endereco) => {
  if (!endereco) return ''
  const partes = [
    endereco.rua ? `${endereco.rua}${endereco.numero ? ', ' + endereco.numero : ''}` : '',
    endereco.bairro || '',
    endereco.cidade || '',
    endereco.estado || '',
    endereco.cep || '',
    'Brasil',
  ].filter(Boolean)
  return partes.join(', ')
}

// Geocodifica um endereço usando a API pública Nominatim (OpenStreetMap) - gratuita, sem API key
export const geocodeEndereco = async (query) => {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } })
  if (!res.ok) return null
  const data = await res.json()
  if (!data || !data[0]) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}

// Calcula a distância aproximada (em metros) entre duas coordenadas usando a fórmula de Haversine
const haversineDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371000 // raio da Terra em metros
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Agrupa imóveis cujas coordenadas estão a uma distância menor que `thresholdMeters` entre si.
// Algoritmo guloso simples: cada ponto ainda não agrupado inicia um novo grupo e "puxa" para
// dentro todos os pontos restantes que estejam próximos o suficiente de algum membro do grupo.
const groupNearbyPoints = (pontos, thresholdMeters = 25) => {
  const restantes = [...pontos]
  const grupos = []

  while (restantes.length > 0) {
    const grupoAtual = [restantes.shift()]

    let cresceu = true
    while (cresceu) {
      cresceu = false
      for (let i = restantes.length - 1; i >= 0; i--) {
        const candidato = restantes[i]
        const pertence = grupoAtual.some(
          membro => haversineDistance(membro.geo.lat, membro.geo.lng, candidato.geo.lat, candidato.geo.lng) <= thresholdMeters
        )
        if (pertence) {
          grupoAtual.push(candidato)
          restantes.splice(i, 1)
          cresceu = true
        }
      }
    }

    grupos.push(grupoAtual)
  }

  return grupos
}

// Dado um grupo de imóveis muito próximos, calcula uma posição "espalhada" em círculo para
// cada um deles ao redor do centro do grupo, para que fiquem visualmente distinguíveis no mapa.
// Grupos com um único imóvel mantêm a coordenada original.
const spreadGroupPositions = (grupo) => {
  if (grupo.length === 1) {
    return [{ imovel: grupo[0], lat: grupo[0].geo.lat, lng: grupo[0].geo.lng, clusterSize: 1 }]
  }

  const centerLat = grupo.reduce((sum, im) => sum + im.geo.lat, 0) / grupo.length
  const centerLng = grupo.reduce((sum, im) => sum + im.geo.lng, 0) / grupo.length

  // Raio do círculo em metros: cresce um pouco conforme o número de imóveis no mesmo local,
  // para que grupos maiores não fiquem apertados demais
  const raioMetros = 1 + Math.min(grupo.length, 1) * 4

  return grupo.map((imovel, index) => {
    const angulo = (2 * Math.PI * index) / grupo.length
    const deltaLat = (raioMetros * Math.cos(angulo)) / 111320
    const deltaLng = (raioMetros * Math.sin(angulo)) / (111320 * Math.cos((centerLat * Math.PI) / 180))
    return {
      imovel,
      lat: centerLat + deltaLat,
      lng: centerLng + deltaLng,
      clusterSize: grupo.length,
    }
  })
}

// Componente do mapa: recebe a lista de imóveis e plota um marcador para cada um que já
// possui coordenadas (im.geo.lat / im.geo.lng)
export function MapaImoveis({ imoveis }) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markersLayerRef = useRef(null)

  // Inicializa o mapa uma única vez
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return
    mapRef.current = L.map(mapContainerRef.current, {
      center: BRASIL_CENTER,
      zoom: 4,
      scrollWheelZoom: true, // zoom com a rolagem do mouse habilitado
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contribuidores',
      maxZoom: 19,
    }).addTo(mapRef.current)
    markersLayerRef.current = L.layerGroup().addTo(mapRef.current)

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // Atualiza os marcadores sempre que a lista de imóveis (ou suas coordenadas) mudar
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current) return
    markersLayerRef.current.clearLayers()

    const pontos = imoveis.filter(im => im.geo?.lat && im.geo?.lng)

    // Agrupa imóveis muito próximos entre si e calcula uma posição "espalhada" em círculo para
    // cada um, para que seja possível ver e clicar em todos individualmente no mapa
    const grupos = groupNearbyPoints(pontos, 2)

    grupos.forEach(grupo => {
      const posicoes = spreadGroupPositions(grupo)

      posicoes.forEach(({ imovel: im, lat, lng, clusterSize }) => {
        const enderecoTexto = [im.endereco?.rua, im.endereco?.numero, im.endereco?.bairro, im.endereco?.cidade]
          .filter(Boolean)
          .join(', ')

        // Quando há mais de um imóvel no mesmo local, usa um ícone com uma "bolinha" indicando
        // quantos imóveis estão agrupados naquele ponto, para deixar isso visível de cara no mapa
        const icon = clusterSize > 1
          ? L.divIcon({
              className: 'imovel-cluster-icon',
              html: `
                <div style="position: relative;">
                  <img src="${markerIcon}" style="width: 25px; height: 41px;" />
                  <span style="
                    position: absolute;
                    top: -6px;
                    right: -8px;
                    background: #ef4444;
                    color: white;
                    border-radius: 9999px;
                    min-width: 16px;
                    height: 16px;
                    padding: 0 3px;
                    font-size: 10px;
                    font-weight: 600;
                    line-height: 16px;
                    text-align: center;
                    border: 1.5px solid white;
                  ">${clusterSize}</span>
                </div>
              `,
              iconSize: [25, 41],
              iconAnchor: [12, 41],
              popupAnchor: [0, -34],
            })
          : undefined

        const marker = icon ? L.marker([lat, lng], { icon }) : L.marker([lat, lng])
        marker.bindPopup(`
          <strong>${im.codigo || 'Sem código'}</strong><br/>
          ${enderecoTexto || 'Endereço não informado'}<br/>
          <span style="color:#64748b">${im.ocupado ? 'Ocupado' : 'Desocupado'}</span>
          ${clusterSize > 1 ? `<br/><span style="color:#ef4444;font-size:11px">${clusterSize} imóveis próximos deste ponto</span>` : ''}
        `)
        marker.addTo(markersLayerRef.current)
      })
    })

    if (pontos.length > 0) {
      const bounds = L.latLngBounds(pontos.map(im => [im.geo.lat, im.geo.lng]))
      mapRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 })
    }
  }, [imoveis])

  return <div ref={mapContainerRef} style={{ width: '100%', height: 420, borderRadius: 8 }} />
}

// Mapa de um único imóvel, usado na tela de edição: mostra apenas o marcador do imóvel em
// questão e permite ao usuário arrastar o marcador ou clicar no mapa para definir/ajustar a
// posição manualmente (útil quando o endereço não é encontrado automaticamente).
export function MapaImovelUnico({ geo, onChange }) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  // Inicializa o mapa uma única vez e liga o clique para definir a posição manualmente
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return
    const center = geo?.lat && geo?.lng ? [geo.lat, geo.lng] : BRASIL_CENTER
    mapRef.current = L.map(mapContainerRef.current, {
      center,
      zoom: geo?.lat && geo?.lng ? 16 : 4,
      scrollWheelZoom: true,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contribuidores',
      maxZoom: 19,
    }).addTo(mapRef.current)

    mapRef.current.on('click', (e) => {
      onChangeRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng })
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // Mantém o marcador sincronizado com a posição atual (`geo`), criando-o na primeira vez
  useEffect(() => {
    if (!mapRef.current) return
    if (!geo?.lat || !geo?.lng) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    if (!markerRef.current) {
      markerRef.current = L.marker([geo.lat, geo.lng], { draggable: true }).addTo(mapRef.current)
      markerRef.current.on('dragend', () => {
        const pos = markerRef.current.getLatLng()
        onChangeRef.current?.({ lat: pos.lat, lng: pos.lng })
      })
    } else {
      markerRef.current.setLatLng([geo.lat, geo.lng])
    }
    mapRef.current.setView([geo.lat, geo.lng], Math.max(mapRef.current.getZoom(), 16))
  }, [geo?.lat, geo?.lng])

  return <div ref={mapContainerRef} style={{ width: '100%', height: 280, borderRadius: 8 }} />
}
