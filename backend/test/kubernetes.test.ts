import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { ingressesToServices, type Ingress } from '../src/kubernetes.js'
import { parseKubeconfig } from '../src/kubernetes.js'

function ing(partial: Partial<Ingress> & { metadata: Ingress['metadata'] }): Ingress {
  return { spec: {}, ...partial } as Ingress
}

describe('ingressesToServices', () => {
  test('keeps only ingresses annotated dashboard.enable=true', () => {
    const out = ingressesToServices([
      ing({ metadata: { name: 'a', namespace: 'default', annotations: { 'dashboard.enable': 'true' } },
            spec: { rules: [{ host: 'a.example.com' }] } }),
      ing({ metadata: { name: 'b', namespace: 'default', annotations: {} },
            spec: { rules: [{ host: 'b.example.com' }] } }),
      ing({ metadata: { name: 'c', namespace: 'default', annotations: null },
            spec: { rules: [{ host: 'c.example.com' }] } }),
    ])
    assert.equal(out.length, 1)
    assert.equal(out[0].id, 'k8s:default/a')
  })

  test('http by default, https when the host is in spec.tls', () => {
    const [plain] = ingressesToServices([
      ing({ metadata: { name: 'p', namespace: 'ns', annotations: { 'dashboard.enable': 'true' } },
            spec: { rules: [{ host: 'p.example.com' }] } }),
    ])
    assert.equal(plain.url, 'http://p.example.com')

    const [secure] = ingressesToServices([
      ing({ metadata: { name: 's', namespace: 'ns', annotations: { 'dashboard.enable': 'true' } },
            spec: { rules: [{ host: 's.example.com' }], tls: [{ hosts: ['s.example.com'] }] } }),
    ])
    assert.equal(secure.url, 'https://s.example.com')
  })

  test('appends a simple path but ignores "/" and regex-y paths', () => {
    const [withPath] = ingressesToServices([
      ing({ metadata: { name: 'w', namespace: 'ns', annotations: { 'dashboard.enable': 'true' } },
            spec: { rules: [{ host: 'w.example.com', http: { paths: [{ path: '/app' }] } }] } }),
    ])
    assert.equal(withPath.url, 'http://w.example.com/app')

    const [rootPath] = ingressesToServices([
      ing({ metadata: { name: 'r', namespace: 'ns', annotations: { 'dashboard.enable': 'true' } },
            spec: { rules: [{ host: 'r.example.com', http: { paths: [{ path: '/(.*)' }] } }] } }),
    ])
    assert.equal(rootPath.url, 'http://r.example.com')
  })

  test('annotations override name/url/icon/description/category', () => {
    const [s] = ingressesToServices([
      ing({ metadata: { name: 'raw', namespace: 'ns', annotations: {
        'dashboard.enable': 'true',
        'dashboard.name': 'Grafana',
        'dashboard.url': 'https://grafana.example.com/d/home',
        'dashboard.icon': 'grafana',
        'dashboard.description': 'Dashboards',
        'dashboard.category': 'Monitoring',
      } }, spec: { rules: [{ host: 'ignored.example.com' }] } }),
    ])
    assert.deepEqual(s, {
      id: 'k8s:ns/raw',
      name: 'Grafana',
      url: 'https://grafana.example.com/d/home',
      icon: 'grafana',
      description: 'Dashboards',
      category: 'Monitoring',
    })
  })

  test('drops entries with no usable host/url', () => {
    const out = ingressesToServices([
      ing({ metadata: { name: 'nohost', namespace: 'ns', annotations: { 'dashboard.enable': 'true' } },
            spec: { rules: [] } }),
    ])
    assert.equal(out.length, 0)
  })

  test('excludes dashboard.enable values other than the string "true"', () => {
    const out = ingressesToServices([
      ing({ metadata: { name: 'x', namespace: 'ns', annotations: { 'dashboard.enable': 'false' } },
            spec: { rules: [{ host: 'x.example.com' }] } }),
      ing({ metadata: { name: 'y', namespace: 'ns', annotations: { 'dashboard.enable': '1' } },
            spec: { rules: [{ host: 'y.example.com' }] } }),
    ])
    assert.equal(out.length, 0)
  })
})

describe('parseKubeconfig', () => {
  const caB64 = Buffer.from('CA-PEM').toString('base64')

  const yaml = `
apiVersion: v1
current-context: ctx
clusters:
  - name: c1
    cluster:
      server: https://api.example.com:6443
      certificate-authority-data: ${caB64}
users:
  - name: u1
    user:
      token: secret-token
contexts:
  - name: ctx
    context:
      cluster: c1
      user: u1
`

  test('resolves server, CA, and token from the current context', () => {
    const cfg = parseKubeconfig(yaml)
    assert.ok(cfg)
    assert.equal(cfg.server, 'https://api.example.com:6443')
    assert.equal(cfg.token, 'secret-token')
    assert.equal(cfg.ca?.toString(), 'CA-PEM')
    assert.equal(cfg.insecure, false)
  })

  test('honors insecure-skip-tls-verify', () => {
    const insecureYaml = `
apiVersion: v1
current-context: ctx
clusters:
  - name: c1
    cluster:
      server: https://api.example.com:6443
      insecure-skip-tls-verify: true
users:
  - name: u1
    user:
      token: t
contexts:
  - name: ctx
    context: { cluster: c1, user: u1 }
`
    const cfg = parseKubeconfig(insecureYaml)
    assert.ok(cfg)
    assert.equal(cfg.insecure, true)
  })

  test('returns null when the current context is missing', () => {
    assert.equal(parseKubeconfig('current-context: nope\nclusters: []\n'), null)
  })
})
