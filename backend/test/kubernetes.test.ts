import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { ingressesToServices, type Ingress } from '../src/kubernetes.js'

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
})
