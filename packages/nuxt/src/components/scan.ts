import { basename, extname, join, dirname, relative } from 'pathe'
import { globby } from 'globby'
import { pascalCase, splitByCase } from 'scule'
import type { Component, ComponentsDir } from '@nuxt/schema'
import { isIgnored } from '@nuxt/kit'
import { hyphenate } from '@vue/shared'

/**
 * Scan the components inside different components folders
 * and return a unique list of components
 *
 * @param dirs all folders where components are defined
 * @param srcDir src path of your app
 * @returns {Promise} Component found promise
 */
export async function scanComponents (dirs: ComponentsDir[], srcDir: string): Promise<Component[]> {
  // All scanned components
  const components: Component[] = []

  // Keep resolved path to avoid duplicates
  const filePaths = new Set<string>()

  // All scanned paths
  const scannedPaths: string[] = []

  for (const dir of dirs) {
    // A map from resolved path to component name (used for making duplicate warning message)
    const resolvedNames = new Map<string, string>()

    for (const _file of await globby(dir.pattern!, { cwd: dir.path, ignore: dir.ignore })) {
      const filePath = join(dir.path, _file)

      if (scannedPaths.find(d => filePath.startsWith(d)) || isIgnored(filePath)) {
        continue
      }

      // Avoid duplicate paths
      if (filePaths.has(filePath)) { continue }

      filePaths.add(filePath)

      /**
       * Create an array of prefixes base on the prefix config
       * Empty prefix will be an empty array
       *
       * @example prefix: 'nuxt' -> ['nuxt']
       * @example prefix: 'nuxt-test' -> ['nuxt', 'test']
       */
      const prefixParts = ([] as string[]).concat(
        dir.prefix ? splitByCase(dir.prefix) : [],
        (dir.pathPrefix !== false) ? splitByCase(relative(dir.path, dirname(filePath))) : []
      )

      /**
       * In case we have index as filename the component become the parent path
       *
       * @example third-components/index.vue -> third-component
       * if not take the filename
       * @example thid-components/Awesome.vue -> Awesome
       */
      let fileName = basename(filePath, extname(filePath))

      const mode = fileName.match(/(?<=\.)(client|server)$/)?.[0] as 'client' | 'server' || 'all'
      fileName = fileName.replace(/\.(client|server)$/, '')

      if (fileName.toLowerCase() === 'index') {
        fileName = dir.pathPrefix === false ? basename(dirname(filePath)) : '' /* inherits from path */
      }

      /**
       * Array of fileName parts splitted by case, / or -
       *
       * @example third-component -> ['third', 'component']
       * @example AwesomeComponent -> ['Awesome', 'Component']
       */
      const fileNameParts = splitByCase(fileName)

      const componentNameParts: string[] = []

      while (prefixParts.length &&
        (prefixParts[0] || '').toLowerCase() !== (fileNameParts[0] || '').toLowerCase()
      ) {
        componentNameParts.push(prefixParts.shift()!)
      }

      const componentName = pascalCase(componentNameParts) + pascalCase(fileNameParts)
      const suffix = (mode !== 'all' ? `-${mode}` : '')

      if (resolvedNames.has(componentName + suffix) || resolvedNames.has(componentName)) {
        console.warn(`Two component files resolving to the same name \`${componentName}\`:\n` +
          `\n - ${filePath}` +
          `\n - ${resolvedNames.get(componentName)}`
        )
        continue
      }
      resolvedNames.set(componentName + suffix, filePath)

      const pascalName = pascalCase(componentName).replace(/["']/g, '')
      const kebabName = hyphenate(componentName)
      const shortPath = relative(srcDir, filePath)
      const chunkName = 'components/' + kebabName + suffix

      let component: Component = {
        filePath,
        pascalName,
        kebabName,
        chunkName,
        shortPath,
        export: 'default',
        global: dir.global,
        prefetch: Boolean(dir.prefetch),
        preload: Boolean(dir.preload),
        mode
      }

      if (typeof dir.extendComponent === 'function') {
        component = (await dir.extendComponent(component)) || component
      }

      // Ignore component if component is already defined (with same mode)
      if (!components.some(c => c.pascalName === component.pascalName && ['all', component.mode].includes(c.mode))) {
        components.push(component)
      }
    }
    scannedPaths.push(dir.path)
  }

  return components
}
