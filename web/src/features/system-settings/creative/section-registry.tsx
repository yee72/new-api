/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { createSectionRegistry } from '../utils/section-registry'
import { CreativeAuditsSection } from './audits-section'
import { CreativeBindingsSection } from './bindings-section'
import { CreativeGlobalSection } from './global-section'
import { CreativeSkillsSection } from './skills-section'
import { CreativeTypesSection } from './types-section'

/** 创作面板设置不依赖 SystemOption，占位以满足 registry 签名 */
type CreativeSettingsPlaceholder = Record<string, never>

const CREATIVE_SECTIONS = [
  {
    id: 'global',
    titleKey: 'Global settings',
    build: (_settings: CreativeSettingsPlaceholder) => <CreativeGlobalSection />,
  },
  {
    id: 'types',
    titleKey: 'Creative types',
    build: (_settings: CreativeSettingsPlaceholder) => <CreativeTypesSection />,
  },
  {
    id: 'bindings',
    titleKey: 'Model bindings',
    build: (_settings: CreativeSettingsPlaceholder) => (
      <CreativeBindingsSection />
    ),
  },
  {
    id: 'skills',
    titleKey: 'Skills',
    build: (_settings: CreativeSettingsPlaceholder) => <CreativeSkillsSection />,
  },
  {
    id: 'audits',
    titleKey: 'Audit log',
    build: (_settings: CreativeSettingsPlaceholder) => <CreativeAuditsSection />,
  },
] as const

export type CreativeSectionId = (typeof CREATIVE_SECTIONS)[number]['id']

const creativeRegistry = createSectionRegistry<
  CreativeSectionId,
  CreativeSettingsPlaceholder
>({
  sections: CREATIVE_SECTIONS,
  defaultSection: 'global',
  basePath: '/system-settings/creative',
  urlStyle: 'path',
})

export const CREATIVE_SECTION_IDS = creativeRegistry.sectionIds
export const CREATIVE_DEFAULT_SECTION = creativeRegistry.defaultSection
export const getCreativeSectionNavItems = creativeRegistry.getSectionNavItems
export const getCreativeSectionContent = creativeRegistry.getSectionContent
export const getCreativeSectionMeta = creativeRegistry.getSectionMeta
