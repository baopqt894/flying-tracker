export interface Flight {
  icao24: string
  callsign: string
  originCountry: string
  longitude: number
  latitude: number
  altitude: number | null
  onGround: boolean
  velocity: number | null
  heading: number | null
  verticalRate: number | null
  squawk: string | null
  lastContact: number | null
  timePosition: number | null
  baroAltitude: number | null
  geoAltitude: number | null
  sensors: number[] | null
  spi: boolean
  positionSource: number
  category: number | null
}

export interface StateVectorRaw {
  0: string // icao24
  1: string | null // callsign
  2: string // origin_country
  3: number | null // time_position
  4: number // last_contact
  5: number | null // longitude
  6: number | null // latitude
  7: number | null // baro_altitude
  8: boolean // on_ground
  9: number | null // velocity
  10: number | null // true_track (heading)
  11: number | null // vertical_rate
  12: number[] | null // sensors
  13: number | null // geo_altitude
  14: string | null // squawk
  15: boolean // spi
  16: number // position_source
  17: number | null // category
}

export interface StateVectorRawResponse {
  time: number
  states: StateVectorRaw[] | null
}

export interface StateVectorData {
  time: number
  states: Flight[]
}

export interface MapGeoBounds {
  southernLatitude: number
  northernLatitude: number
  westernLongitude: number
  easternLongitude: number
}

export enum ChangeType {
  None = 0,
  PositionChanged = 1,
  OtherChanged = 2,
}

export interface FlightWithChange extends Flight {
  changeType: ChangeType
  previousLatitude?: number
  previousLongitude?: number
}
