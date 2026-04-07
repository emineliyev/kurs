import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import azCommon from './locales/az/common.json'
import azAuth from './locales/az/auth.json'
import azTeacher from './locales/az/teacher.json'
import azStudent from './locales/az/student.json'

import ruCommon from './locales/ru/common.json'
import ruAuth from './locales/ru/auth.json'
import ruTeacher from './locales/ru/teacher.json'
import ruStudent from './locales/ru/student.json'

import enCommon from './locales/en/common.json'
import enAuth from './locales/en/auth.json'
import enTeacher from './locales/en/teacher.json'
import enStudent from './locales/en/student.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      az: { common: azCommon, auth: azAuth, teacher: azTeacher, student: azStudent },
      ru: { common: ruCommon, auth: ruAuth, teacher: ruTeacher, student: ruStudent },
      en: { common: enCommon, auth: enAuth, teacher: enTeacher, student: enStudent },
    },
    fallbackLng: 'az',
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  })

export default i18n
