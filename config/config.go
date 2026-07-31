package config

import (
	"errors"
	"fmt"
	"os"
	"reflect"
	"sort"
	"strings"

	"github.com/caarlos0/env/v11"
	"github.com/go-playground/validator/v10"
	"github.com/joho/godotenv"
)

// Config aggregates every typed config section. Load it once at process
// start via Load or MustLoad; nothing downstream reads os.Getenv directly.
type Config struct {
	App      AppConfig
	HTTP     HTTPConfig
	DB       DBConfig
	Redis    RedisConfig
	JWT      JWTConfig
	Bcrypt   BcryptConfig
	Auth     AuthConfig
	Security SecurityConfig
	Swagger  SwaggerConfig
	Seed     SeedConfig
}

var validate = newValidator()

func newValidator() *validator.Validate {
	v := validator.New(validator.WithRequiredStructEnabled())
	v.RegisterTagNameFunc(func(f reflect.StructField) string {
		return f.Name
	})
	return v
}

// Load reads .env (local/test only), parses environment variables into a
// Config, and validates it. Every invalid key is reported at once.
func Load() (*Config, error) {
	// APP_ENV itself must come from a real env var (or its default) so the
	// decision to read .env cannot be made by the file it is deciding to read.
	appEnv := envOrDefault("APP_ENV", EnvLocal)
	if isDotEnvEnv(appEnv) {
		_ = godotenv.Load()
	}

	cfg := &Config{}
	if err := env.Parse(cfg); err != nil {
		return nil, fmt.Errorf("config: parse: %w", err)
	}

	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

// MustLoad is Load, but panics on failure. Only entrypoints (cmd/*) call it.
func MustLoad() *Config {
	cfg, err := Load()
	if err != nil {
		panic(err)
	}
	return cfg
}

// Validate runs struct-tag validation plus cross-field and production-only
// rules, aggregating every problem into a single error.
func (c *Config) Validate() error {
	var problems []string

	fieldProblems, err := validateStruct(c)
	if err != nil {
		return err
	}
	problems = append(problems, fieldProblems...)
	problems = append(problems, crossFieldProblems(c)...)
	if c.App.IsProd() {
		problems = append(problems, productionProblems(c)...)
	}

	if len(problems) == 0 {
		return nil
	}

	sort.Strings(problems)
	return fmt.Errorf("config: invalid configuration:\n  - %s", strings.Join(problems, "\n  - "))
}

func validateStruct(c *Config) ([]string, error) {
	err := validate.Struct(c)
	if err == nil {
		return nil, nil
	}

	var invalid *validator.InvalidValidationError
	if errors.As(err, &invalid) {
		return nil, err
	}

	var fieldErrs validator.ValidationErrors
	if !errors.As(err, &fieldErrs) {
		return nil, err
	}

	problems := make([]string, 0, len(fieldErrs))
	for _, fe := range fieldErrs {
		problems = append(problems, describe(fe))
	}
	return problems, nil
}

// describe renders a validator.FieldError as a message naming the env var,
// not the Go struct path, since the operator sets env vars, not fields.
func describe(fe validator.FieldError) string {
	envVar := envVarName(fe.StructNamespace())

	switch fe.Tag() {
	case "required":
		return fmt.Sprintf("%s is required", envVar)
	case "min":
		return fmt.Sprintf("%s must be >= %s", envVar, fe.Param())
	case "max":
		return fmt.Sprintf("%s must be <= %s", envVar, fe.Param())
	case "oneof":
		return fmt.Sprintf("%s must be one of [%s]", envVar, fe.Param())
	case "email":
		return fmt.Sprintf("%s must be a valid email address", envVar)
	case "url":
		return fmt.Sprintf("%s must be a valid URL", envVar)
	case "startswith":
		return fmt.Sprintf("%s must start with %q", envVar, fe.Param())
	default:
		return fmt.Sprintf("%s failed validation %q", envVar, fe.Tag())
	}
}

// envVarName resolves a validator struct namespace (e.g. "Config.JWT.AccessSecret")
// to the env tag actually printed in .env.example, by walking the Config type
// through the same field path.
func envVarName(namespace string) string {
	parts := strings.Split(namespace, ".")
	if len(parts) < 2 {
		return namespace
	}

	t := reflect.TypeOf(Config{})
	for _, name := range parts[1:] {
		field, ok := t.FieldByName(name)
		if !ok {
			return namespace
		}
		if tag, ok := field.Tag.Lookup("env"); ok && tag != "" {
			return tag
		}
		ft := field.Type
		for ft.Kind() == reflect.Ptr {
			ft = ft.Elem()
		}
		if ft.Kind() != reflect.Struct {
			return namespace
		}
		t = ft
	}
	return namespace
}

// crossFieldProblems checks invariants a single field's tags cannot express.
func crossFieldProblems(c *Config) []string {
	var problems []string

	if c.JWT.AccessSecret != "" && c.JWT.AccessSecret == c.JWT.RefreshSecret {
		problems = append(problems, "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ")
	}
	if c.JWT.AccessTTL >= c.JWT.RefreshTTL {
		problems = append(problems, "JWT_ACCESS_TTL must be shorter than JWT_REFRESH_TTL")
	}
	if c.DB.MaxIdleConns > c.DB.MaxOpenConns {
		problems = append(problems, "DB_MAX_IDLE_CONNS must be <= DB_MAX_OPEN_CONNS")
	}
	if c.Security.CORSAllowsWildcard() && c.Security.CORSAllowCreds {
		problems = append(problems, "CORS_ALLOWED_ORIGINS cannot be \"*\" when CORS_ALLOW_CREDENTIALS=true")
	}
	if c.Auth.RefreshCookie && !c.Security.CORSAllowCreds {
		problems = append(problems, "AUTH_REFRESH_COOKIE=true requires CORS_ALLOW_CREDENTIALS=true")
	}

	return problems
}

// productionProblems refuses to boot APP_ENV=prod with a development-shaped
// configuration. Each of these has shipped a real breach somewhere.
func productionProblems(c *Config) []string {
	var problems []string

	if len(c.JWT.AccessSecret) < 32 {
		problems = append(problems, "JWT_ACCESS_SECRET must be >= 32 chars in prod")
	}
	if len(c.JWT.RefreshSecret) < 32 {
		problems = append(problems, "JWT_REFRESH_SECRET must be >= 32 chars in prod")
	}
	if c.DB.SSLMode == "disable" {
		problems = append(problems, "DB_SSLMODE must not be \"disable\" in prod")
	}
	if c.Swagger.Enabled {
		problems = append(problems, "SWAGGER_ENABLED must be false in prod")
	}
	if c.Security.CORSAllowsWildcard() {
		problems = append(problems, "CORS_ALLOWED_ORIGINS must not contain \"*\" in prod")
	}
	if c.DB.AutoMigrate {
		problems = append(problems, "DB_AUTO_MIGRATE must be false in prod")
	}
	if c.Auth.RegistrationEnabled {
		problems = append(problems, "AUTH_REGISTRATION_ENABLED must be false in prod")
	}

	return problems
}

func isDotEnvEnv(appEnv string) bool {
	return appEnv == EnvLocal || appEnv == EnvTest
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
