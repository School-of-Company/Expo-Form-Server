import { buildEurekaOptions, FORM_EUREKA_APP_NAME } from './eureka-options.js';

const baseEnv = {
  serviceUrl: 'http://127.0.0.1:8761/eureka',
  hostName: 'form-1',
  ipAddr: '10.0.0.5',
  port: '3000',
};

describe('buildEurekaOptions', () => {
  it('registers under the name the gateway routes /forms and /surveys to', () => {
    const options = buildEurekaOptions(baseEnv);

    expect(FORM_EUREKA_APP_NAME).toBe('expo-form-server');
    expect(options.instance).toEqual({
      app: 'expo-form-server',
      hostName: 'form-1',
      ipAddr: '10.0.0.5',
      port: 3000,
    });
  });

  it('keeps booting when Eureka is down (background registration)', () => {
    expect(buildEurekaOptions(baseEnv).registrationMode).toBe('background');
  });

  it('passes a single URL as a string', () => {
    expect(buildEurekaOptions(baseEnv).serviceUrl).toBe(
      'http://127.0.0.1:8761/eureka',
    );
  });

  it('splits comma-separated URLs into an array', () => {
    const options = buildEurekaOptions({
      ...baseEnv,
      serviceUrl: 'http://a:8761/eureka, http://b:8761/eureka,',
    });

    expect(options.serviceUrl).toEqual([
      'http://a:8761/eureka',
      'http://b:8761/eureka',
    ]);
  });

  it('defaults the port to 3000 like main.ts', () => {
    expect(
      buildEurekaOptions({ ...baseEnv, port: undefined }).instance.port,
    ).toBe(3000);
  });

  it('requires the instance host name and IP once Eureka is enabled', () => {
    expect(() => buildEurekaOptions({ ...baseEnv, ipAddr: undefined })).toThrow(
      /INSTANCE_IP_ADDR/u,
    );
    expect(() =>
      buildEurekaOptions({ ...baseEnv, hostName: undefined }),
    ).toThrow(/INSTANCE_HOSTNAME/u);
  });

  it('rejects an empty URL list and an invalid port', () => {
    expect(() => buildEurekaOptions({ ...baseEnv, serviceUrl: ' , ' })).toThrow(
      /EUREKA_SERVICE_URL/u,
    );
    expect(() => buildEurekaOptions({ ...baseEnv, port: 'abc' })).toThrow(
      /Invalid PORT/u,
    );
  });

  describe('prometheus metadata', () => {
    const scrape = {
      'prometheus.scrape': 'true',
      'prometheus.port': '9464',
      'prometheus.path': '/metrics',
    };

    it('실제로 열린 listener가 인스턴스 IP로 닿으면 같은 포트를 등록한다', () => {
      const options = buildEurekaOptions(baseEnv, {
        host: '10.0.0.5',
        port: 9464,
      });

      expect(options.instance.metadata).toEqual(scrape);
    });

    it('0.0.0.0은 IPv4 인스턴스에만, ::는 IPv4·IPv6 모두에 닿는다', () => {
      expect(
        buildEurekaOptions(baseEnv, { host: '0.0.0.0', port: 9464 }).instance
          .metadata,
      ).toEqual(scrape);
      expect(
        buildEurekaOptions(baseEnv, { host: '::', port: 9464 }).instance
          .metadata,
      ).toEqual(scrape);
      expect(
        buildEurekaOptions(
          { ...baseEnv, ipAddr: 'fd00::5' },
          { host: '0.0.0.0', port: 9464 },
        ).instance.metadata,
      ).toBeUndefined();
    });

    it('loopback에만 열렸으면 수집이 실패하므로 등록하지 않는다', () => {
      expect(
        buildEurekaOptions(baseEnv, { host: '127.0.0.1', port: 9464 }).instance
          .metadata,
      ).toBeUndefined();
    });

    it('listener가 꺼졌거나 열리지 못했으면(bind 없음) 등록하지 않는다', () => {
      expect(buildEurekaOptions(baseEnv).instance.metadata).toBeUndefined();
    });
  });
});
