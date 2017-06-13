if g:dein#_cache_version != 100 | throw 'Cache loading error' | endif
let [plugins, ftplugin] = dein#load_cache_raw(['/Users/ryo/dotsfile/nvim/init.vim', '/Users/ryo/.config/nvim/toml/dein.toml', '/Users/ryo/.config/nvim/toml/dein_lazy.toml'])
if empty(plugins) | throw 'Cache loading error' | endif
let g:dein#_plugins = plugins
let g:dein#_ftplugin = ftplugin
let g:dein#_base_path = '/Users/ryo/.config/nvim/plugins'
let g:dein#_runtime_path = '/Users/ryo/.config/nvim/plugins/.cache/init.vim/.dein'
let g:dein#_cache_path = '/Users/ryo/.config/nvim/plugins/.cache/init.vim'
let &runtimepath = '/Users/ryo/.config/nvim,/etc/xdg/nvim,/Users/ryo/.local/share/nvim/site,/usr/local/share/nvim/site,/Users/ryo/.config/nvim/plugins/repos/github.com/Shougo/vimproc.vim,/Users/ryo/.config/nvim/plugins/Shougo/dein.vim,/Users/ryo/.config/nvim/plugins/.cache/init.vim/.dein,/usr/share/nvim/site,/usr/local/Cellar/neovim/0.2.0/share/nvim/runtime,/Users/ryo/.config/nvim/plugins/.cache/init.vim/.dein/after,/usr/share/nvim/site/after,/usr/local/share/nvim/site/after,/Users/ryo/.local/share/nvim/site/after,/etc/xdg/nvim/after,/Users/ryo/.config/nvim/after'
filetype off
autocmd dein-events InsertEnter * call dein#autoload#_on_event("InsertEnter", ['neosnippet', 'deoplete.nvim'])
