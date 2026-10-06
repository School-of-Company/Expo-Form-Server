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
});
