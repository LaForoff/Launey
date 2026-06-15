import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState, type ReactElement } from 'react'
import { useClock } from '../../hooks/useClock'
import { useWeather } from '../../hooks/useWeather'
import './Header.css'

interface HeaderProps {
  weatherLocation: string
}

export function Header({ weatherLocation }: HeaderProps) {
  const { date, time } = useClock()
  const { temperatureText, weatherIconKind } = useWeather(weatherLocation)
  const cityName = (weatherLocation.split(',')[0] ?? '').trim() || 'Город'
  const iconSize = 18

  const weatherIcon =
    weatherIconKind === 'sun' ? (
      <Sun size={iconSize} weight="fill" />
    ) : weatherIconKind === 'cloud-sun' ? (
      <CloudSun size={iconSize} weight="fill" />
    ) : weatherIconKind === 'rain' ? (
      <CloudRain size={iconSize} weight="fill" />
    ) : weatherIconKind === 'snow' ? (
      <CloudSnow size={iconSize} weight="fill" />
    ) : weatherIconKind === 'lightning' ? (
      <CloudLightning size={iconSize} weight="fill" />
    ) : weatherIconKind === 'fog' ? (
      <CloudFog size={iconSize} weight="fill" />
    ) : (
      <Cloud size={iconSize} weight="fill" />
    )

  return (
    <header className="header">
      <AnimatedBlurText className="header-date" value={date} />
      <AnimatedTime value={time} />
      <AnimatedWeather
        cityName={cityName}
        temperatureText={temperatureText}
        weatherIcon={weatherIcon}
        weatherIconKind={weatherIconKind}
      />
    </header>
  )
}

interface AnimatedTimeProps {
  value: string
}

function AnimatedTime({ value }: AnimatedTimeProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())
  const [isSeparatorVisible, setIsSeparatorVisible] = useState(true)
  const [hoursPart = '', minutesPart = ''] = value.split(':')

  useEffect(() => {
    if (shouldReduceMotion) {
      setIsSeparatorVisible(true)
      return
    }

    const timer = window.setInterval(() => {
      setIsSeparatorVisible((current) => !current)
    }, 1000)

    return () => window.clearInterval(timer)
  }, [shouldReduceMotion])

  return (
    <p className="header-time" aria-label={value}>
      <span className="time-hours" aria-hidden="true">
        {shouldReduceMotion ? (
          <span className="header-time-group">{hoursPart}</span>
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={hoursPart}
              className="header-time-group"
              initial={{
                opacity: 0,
                y: '30%',
                scale: 0.94,
                filter: 'blur(14px)',
              }}
              animate={{
                opacity: 1,
                y: '0%',
                scale: 1,
                filter: 'blur(0px)',
              }}
              exit={{
                opacity: 0,
                y: '-30%',
                scale: 1.04,
                filter: 'blur(14px)',
              }}
              transition={{
                duration: 0.46,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {hoursPart}
            </motion.span>
          </AnimatePresence>
        )}
      </span>
      <span
        className={isSeparatorVisible ? 'time-separator header-time-colon' : 'time-separator header-time-colon is-hidden'}
        aria-hidden="true"
      />
      <span className="time-minutes" aria-hidden="true">
        {shouldReduceMotion ? (
          <span className="header-time-group">{minutesPart}</span>
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={minutesPart}
              className="header-time-group"
              initial={{
                opacity: 0,
                y: '30%',
                scale: 0.94,
                filter: 'blur(14px)',
              }}
              animate={{
                opacity: 1,
                y: '0%',
                scale: 1,
                filter: 'blur(0px)',
              }}
              exit={{
                opacity: 0,
                y: '-30%',
                scale: 1.04,
                filter: 'blur(14px)',
              }}
              transition={{
                duration: 0.46,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {minutesPart}
            </motion.span>
          </AnimatePresence>
        )}
      </span>
    </p>
  )
}

interface AnimatedBlurTextProps {
  className: string
  value: string
}

function AnimatedBlurText({ className, value }: AnimatedBlurTextProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())

  if (shouldReduceMotion) {
    return <p className={className}>{value}</p>
  }

  return (
    <p className={className} aria-label={value}>
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={value}
          className="header-blur-line"
          initial={{ opacity: 0, y: '28%', filter: 'blur(12px)' }}
          animate={{ opacity: 1, y: '0%', filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: '-28%', filter: 'blur(12px)' }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </p>
  )
}

interface AnimatedWeatherProps {
  cityName: string
  temperatureText: string
  weatherIcon: ReactElement
  weatherIconKind: string
}

function AnimatedWeather({ cityName, temperatureText, weatherIcon, weatherIconKind }: AnimatedWeatherProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())
  const weatherKey = `${cityName}|${temperatureText}|${weatherIconKind}`

  if (shouldReduceMotion) {
    return (
      <div className="weather">
        <span className="weather-city">{cityName},</span>
        {weatherIcon}
        <span className="weather-temp">{temperatureText}</span>
      </div>
    )
  }

  return (
    <div className="weather" aria-label={`${cityName}, ${temperatureText}`}>
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={weatherKey}
          className="weather-animated"
          initial={{ opacity: 0, y: '24%', filter: 'blur(12px)' }}
          animate={{ opacity: 1, y: '0%', filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: '-24%', filter: 'blur(12px)' }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="weather-city">{cityName},</span>
          {weatherIcon}
          <span className="weather-temp">{temperatureText}</span>
        </motion.span>
      </AnimatePresence>
    </div>
  )
}
