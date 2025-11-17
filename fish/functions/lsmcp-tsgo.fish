function lsmcp-tsgo
  set -gx ASDF_NODEJS_VERSION 22.18.0
  exec npx -y @mizchi/lsmcp -p tsgo
end
