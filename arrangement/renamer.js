﻿/**
 * @fileoverview rename files downloaded.
 * 
 * e.g., abc.rar → 確実な名前.abc.rar
 * 
 * node renamer.js [category [directory]]
 * 
 * @since 2016/12/19 14:17:11 初版: files from nyaa<br />
 *        2017/5/4 20:18:3 files from AcgnX末日動漫資源庫<br />
 *        2017/5/18 20:32:19 files from http://nyaa.si/
 */

'use strict';

global.need_work_id = false;

require('../work_crawler_loader.js');

// ----------------------------------------------------------------------------
// Load module.

CeL.run([
// for HTML_to_Unicode()
'interact.DOM',
// archive()
'application.storage.archive' ]);

// ----------------------------------------------------------------------------

CeL.get_URL.default_user_agent = "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.87 Safari/537.36"
		+ Math.random();

var
/** {String}下載完成、要處理的檔案/目錄所放置的目錄。 e.g., "node renamer.js C target_directory" */
target_directory = process.argv[3]
		|| CeL.first_exist_fso(global.completed_directory) || '.',
//
default_menu_page_length = 100,
// start from menu NO. 1
default_menu_page_starts = 1,
// reget === true: reget till no more new menu files.
// reget > 1: reget ALL menu list.
reget = 2,
//
reget_torrent_files = false,
// 2022/1/31: 1s OK, .5 s NG.
MIN_INTERVAL = torrent_directory && 1 * 1000,
//
category_name = /^H$/i.test(work_id) || /成年|Hcomic|noACG_H/i.test(work_id) ? 'Hcomic'
		: 'comic',
//
categories = {
	Hcomic : [ 'cache_sukebei', 'https://sukebei.nyaa.si/', '1_4',
			default_menu_page_length ],
	comic : [ 'cache_nyaa', 'https://nyaa.si/', '3_3', default_menu_page_length ]
},
//
category_config = categories[category_name],
//
base_directory = data_directory + category_config[0] + CeL.env.path_separator,
// 自動下載 torrent 檔案。
torrent_directory = 'torrent' + CeL.env.path_separator + category_name
		+ CeL.env.path_separator && false,
//
base_URL = category_config[1], category_NO = category_config[2], last_count = category_config[3];

CeL.create_directory(base_directory);

var torrent_file_name_mapping, torrent_file_name_mapping_cache_file_name = 'torrent_id_to_file_name.json';
if (torrent_directory) {
	torrent_directory = base_directory + torrent_directory;
	torrent_file_name_mapping = CeL.read_file(torrent_directory
			+ torrent_file_name_mapping_cache_file_name);
	torrent_file_name_mapping = torrent_file_name_mapping
			&& JSON.parse(torrent_file_name_mapping.toString())
			|| Object.create(null);
	CeL.create_directory(torrent_directory, {
		recursive : true
	});
	// console.trace(torrent_file_name_mapping);
}

var
// target_files[fso name] = path
target_files = Object.create(null), target_directories = Object.create(null),

cache_file = base_directory + 'data.json',
//
cache_data = CeL.get_JSON(cache_file),
// file / folder name
PATTERN_latin_fso_name = /^([\u0020-\u007Fūûōôō@]+?)(\.[a-z\d]{2,9})?$/i,
// [[en:Numerals_in_Unicode#Roman_numerals]]
// /^[a-z\d,:;.?!()<>{}\[\]\-+$%&'"’“”\s\n—–ūûōôō@’★☆♥♡Ⅰ-ↈ①-⑳⑴-⑽㈠-㈩]$/
PATTERN_full_latin_or_sign = /^[\u0020-\u00FF’★☆♥♡Ⅰↈ①⑳⑴⑽㈠㈩／“”\n—–]+$/;

if (target_directory) {
	if (!/[\\\/]$/.test(target_directory)) {
		target_directory += CeL.env.path_separator;
	}
	CeL.info('Target directory: ' + target_directory);

	CeL.traverse_file_system(target_directory, function(path, fso_status,
			is_directory) {
		// CeL.log('Test: ' + path);
		if (is_directory) {
			target_directories[fso_status.name] = path;
			return;
		}

		var fso_name = fso_status.name;
		// e.g., "RJ287557.zip"
		if (/^RJ\d{6,}(-v[\d.]+| *\([\d.]+\))?\.(?:zip|rar|7z)+$/
				.test(fso_name)) {
			var archive_file = new CeL.application.storage.archive(
					target_directory + fso_name, {
						program_type : '7z'
					});
			// console.trace(archive_file);
			archive_file.info(function(file_info_hash) {
				try {
					rename_dlsite_works(fso_name, target_directory,
					//
					file_info_hash);
				} catch (e) {
					// TODO: handle exception
					console.error(e);
				}
			});
		}

		target_files[fso_name] = path;
	}, PATTERN_full_latin_or_sign, 1);

	if (CeL.is_empty_object(target_files)
			&& CeL.is_empty_object(target_directories)) {
		CeL.info(CeL.env.script_name + ': No target to rename.');
	} else {
		// console.log([target_directories, target_files]);
		CeL.info(CeL.env.script_name + ': Rename ' + category_name + ' @ '
				+ target_directory + '\n' + Object.keys(target_files).length
				+ ' files, ' + Object.keys(target_directories).length
				+ ' directories to rename.');
	}
}

// CeL.set_debug(3);
get_menu_list();

// -------------------------------------------------------------------------------------------------

// for AcgnX末日動漫資源庫 HamotionCloud: DDOS Protection by Voxility.
// Cloudflare protection?
function check_reget(XMLHttp, options) {
	if (XMLHttp.status === 302) {
		return true;
	}
	var html = XMLHttp.responseText;
	if (html.includes('<title>302 Found</title>')) {
		return true;
	}
	if (html.includes('<body onLoad="javascript:jump()">')) {
		var key = html.between("setCookie('", "'"), value = html.between(
				"'cookie' : \"", '"');
		if (!key || !value) {
			throw 'Cannot parse cookie!';
		}
		if (!options.headers) {
			options.headers = Object.create(null);
		}
		options.headers.Cookie = key + '=' + value;
		return true;
	}
}

var get_URL_options = {
	error_retry : 4,
	check_reget : check_reget
};

function get_menu_list(callback) {
	function for_menu_NO(run_next, index) {
		process.title = 'renamer ' + index + '/' + last_count;
		CeL.info('get_menu_list: menu ' + category_name + ' ' + index + '/'
				+ last_count);
		CeL.get_URL_cache(base_URL + '?c=' + category_NO + '&p=' + index,
		//
		function(html, error, XMLHttp) {
			for_menu_list(html, function() {
				CeL.fs_write(cache_file, cache_data);
				if (reget && this.new_files === 0) {
					CeL.info('No more new menu files.');
				} else {
					CeL.info(this.new_files + ' new files.');
				}
				if (!reget || this.new_files > 0 || reget > 1) {
					// CeL.info('get_menu_list: get next.');
					run_next();
				}
			});
		}, {
			reget : reget,
			get_URL_options : get_URL_options,
			file_name : base_directory + 'menu - ' + category_name + '.'
					+ index + '.htm'
		});
	}

	CeL.run_serial(for_menu_NO, last_count, default_menu_page_starts, callback,
			{
				run_interval : MIN_INTERVAL
			});
}

function for_menu_list(html, callback) {
	html = html.between('<div class="table-responsive">', '<footer ');
	// console.log(html);

	var matched,
	// [ all, id, title, torrent_url ]
	PATTERN_item = /<a href="\/(view\/\d+)" title="([^"<>]+)"[\s\S]+?<a href="([^"<>]+\.torrent)">/g, id_list = [];

	while (matched = PATTERN_item.exec(html)) {
		id_list.push(matched[1]);
	}

	// console.log(id_list);
	// console.log(id_list.length);

	CeL.run_serial(get_file_list, id_list, callback, {
		new_files : 0,
		run_interval : MIN_INTERVAL
	});
}

// @see label_CJK_patterns @ CeL.application.net.wiki
// 年月号: e.g., 2017年01月号
// 第巻: 第01巻
var PATTERN_has_jp = /[\u3041-\u30FF\u31F0-\u31FF\uFA30-\uFA6A第巻]/;

/** node.js file system module */
var node_fs = require('fs');

function get_file_list(callback, id) {
	// CeL.set_debug(6);
	this.callback = callback;
	this.id = id;
	// console.log(this);
	// console.log('get_file_list: ' + id);
	var file_name = base_directory + id.replace(/\//g, '-') + '.html';
	// console.log(file_name);
	CeL.get_URL_cache(base_URL + id,
	//
	parse_file_list.bind(this), {
		// reget : true,
		get_URL_options : get_URL_options,
		file_name : file_name
	});
}

function for_file_page(html) {
	var name = CeL.HTML_to_Unicode(html.between('<td class="viewtorrentname">',
			'</td>')),
	//
	matched = html.match(/showfiles=[^"]+/);
	if (!matched) {
		CeL.error(name + '\n' + html);
	}
	var file_name = base_directory + id.replace(/\//g, '-') + '.list.htm';
	CeL.get_URL_cache(base_URL + '?page=view&tid=' + id + '&' + matched[0],
	//
	parse_file_list, {
		// reget : true,
		get_URL_options : get_URL_options,
		file_name : file_name
	});
}

function get_label(html) {
	return CeL.HTML_to_Unicode(html.replace(/<[^<>]+>/g, '')).trim();
}

// 取得 .torrent 的檔案列表。
function parse_file_list(html, error, XMLHttp, had_try_to_got_torrent) {
	if (false) {
		console.trace([ torrent_directory, reget_torrent_files,
				had_try_to_got_torrent ]);
	}

	// <div class="col-md-5" data-timestamp="1643596207">2022-01-31 02:30
	// UTC</div>
	var upload_date = html.match(/ data-timestamp="(\d{10})"/);
	if (upload_date) {
		upload_date = new Date(1000 * upload_date[1]);
	}

	if (torrent_directory && !had_try_to_got_torrent) {
		// <a href="/download/1485094.torrent"><i class="fa fa-download
		// fa-fw"></i>Download Torrent</a> or
		var _this = this, matched = html.match(/ href="([^<>"']+\.torrent)"/);
		if (matched) {
			function after_get_torrent_file(_html, error, XMLHttp) {
				if (error) {
					CeL.error(error);
				} else if ((matched = XMLHttp.cached_file_path)
				//
				&& (matched = matched.match(/([^\\\/]+)\.torrent$/i))) {
					matched = matched[1];
					// assert: XMLHttp.cached_file_path ===
					// download_directory + matched + '.torrent'
					torrent_file_name_mapping[torrent_id] = matched[1];
					CeL.write_file(torrent_directory
					//
					+ torrent_file_name_mapping_cache_file_name,
							torrent_file_name_mapping);
				}
				parse_file_list.call(_this, html, error, XMLHttp, true);
			}

			matched = matched[1].replace(/^[\\\/]/, '');
			var torrent_id = matched.match(/([^\\\/]+)\.torrent$/i);
			torrent_id = torrent_id && torrent_id[1];
			var sub_directory = upload_date ? upload_date.format('%Y-%2m')
					+ CeL.env.path_separator : '';
			var download_directory = torrent_directory + sub_directory;
			var file_name = torrent_file_name_mapping[torrent_id]
					&& torrent_file_name_mapping[torrent_id] + '.torrent';
			if (sub_directory) {
				CeL.create_directory(download_directory);
				if (file_name && CeL.file_exists(torrent_directory + file_name)) {
					CeL.move_file(torrent_directory + file_name,
							download_directory + file_name);
				}
			}
			if (reget_torrent_files || !file_name
					|| !CeL.file_exists(download_directory + file_name)) {
				setTimeout(function() {
					CeL.get_URL_cache(base_URL + matched,
					//
					after_get_torrent_file, {
						reget : reget_torrent_files,
						get_URL_options : get_URL_options,
						directory : download_directory
					});
				}, MIN_INTERVAL);
				// 等取得 .torrent 檔案再執行。
				return;
			}
			if (file_name) {
				CeL.debug('跳過先前已下載之檔案: ' + torrent_id + '→' + file_name, 1,
						'parse_file_list');
			}

		} else {
			// console.trace(html);
		}
	}

	var full_title = get_label(html
			.between('<h3 class="panel-title">', '</h3>'));
	if (!full_title && html.includes('DDOS Protection')) {
		CeL.fs_remove(base_directory + this.id + '.html');
		throw new Error('DDOS Protection');
	}

	var file_list_html = html.between('torrent-file-list', '</div>').between(
			'>');
	if (!file_list_html) {
		// console.log(arguments[0]);
		if (/<title>404 [^<>]*<\/title>/.test(html)) {
			typeof this.callback === 'function' && this.callback();
		} else {
			CeL.error('parse_file_list: It seems the shame was changed!');
			CeL.log(html);
		}
		return;
	}

	if (XMLHttp) {
		this.new_files++;
	}
	// 就算利用的是 cache，依然檢查檔案而不直接跳出。

	CeL.debug(full_title, 2, 'parse_file_list');
	// console.log(file_list_html);

	var folder_list = [];
	file_list_html.each_between('<i class="fa fa-folder', '</a>',
	// e.g., "<a href="" class="folder"><i class="fa fa-folder"></i>"
	// "<a href="" class="folder"><i class="fa fa-folder-open"></i>"
	function(token) {
		if (token = get_label(token.between('</i>'))) {
			folder_list.push(token);
		}
	});

	var file_list = [];
	file_list_html.each_between('<i class="fa fa-file"></i>', '</li>',
	//
	function(token) {
		token = token.between(null, '<span class="file-size">') || token;
		if (token = get_label(token).trim()) {
			file_list.push(token);
		}
	});

	if (file_list.length === 0 && folder_list.length === 0) {
		// shame changed?
		throw new Error('Nothing get on ' + full_title);
	}

	if (false) {
		// CeL.debug(name, 2, 'parse_file_list');
		if (/Dobutsu no Mori/.test(full_title)) {
			console.log(folder_list);
		}
		CeL.fs_write(base_directory + id + '.data.json', {
			full_title : full_title,
			files : file_list
		});
	}

	function rename_process(fso_name) {
		var matched;
		// CeL.debug('[' + fso_name + '] ' + full_title, 0, 'rename_process');
		if (PATTERN_full_latin_or_sign.test(full_title) || !fso_name
		// matched: [ all, main file name, '.' + extension ]
		|| !(matched = fso_name.match(PATTERN_latin_fso_name))) {
			// CeL.log('NG: ' + fso_name);
			return;
		}
		// console.log(matched);
		if (false && matched[0].includes('ō')) {
			console.log(matched);
			console.log(target_files);
		}

		function rename(fso_name, is_file) {
			var fso_key = is_file ? target_files[fso_name]
					: target_directories[fso_name];
			if (!fso_key) {
				for ( var file_name in target_files) {
					var _matched = file_name.match(/^(.+)(\.[^.]+)$/);
					// console.log([ _matched[1], fso_name ]);
					if (_matched && _matched[1] === fso_name) {
						CeL.warn('在目錄改名之前就已先壓縮成了檔案？ ' + file_name);
						fso_key = target_files[fso_name = file_name];
						break;
					}
				}
			}

			if (false && /Demi/.test(fso_name)) {
				console.log([ is_file, target_files, target_directories ])
				console.log([ fso_key, fso_name, full_title ]);
			}
			if (!fso_key || fso_name.includes(full_title)) {
				return;
			}
			var move_to = CeL.to_file_name(full_title).replace(/\.+$/, ''),
			//
			from_page = (move_to + matched[2])/* .replace(/_/g, ' ') */,
			//
			file_name = matched[1]/* .replace(/_/g, ' ') */;
			if (is_file && (from_page.includes(file_name)
			// from_page 有較多資訊。
			|| from_page.toLowerCase().includes(file_name))) {
				move_to += matched[2];
			} else {
				move_to += '.' + fso_name;
			}
			// console.log(JSON.stringify(fso_name));
			// console.log(JSON.stringify(move_to));
			CeL.info(fso_name + '→' + move_to);
			var error = CeL.fs_move(target_directory + fso_name,
					target_directory + move_to);
			if (error) {
				CeL.error(error);
			} else if (is_file) {
				delete target_files[fso_name];
				fso_name = move_to;
			} else {
				delete target_directories[fso_name];
				fso_name = move_to;
			}
		}

		CeL.debug(matched[0] + ': ' + full_title, 3, 'rename_process');
		rename(matched[0], true);
		rename(matched[0].replace(/ /g, '_'), true);
		rename(matched[0].replace(/_/g, ' '), true);

		CeL.debug(matched[1] + ': ' + full_title, 3, 'rename_process');
		rename(matched[1]);
		rename(matched[1].replace(/ /g, '_'));
		rename(matched[1].replace(/_/g, ' '));
	}

	if (false) {
		CeL.info('parse_file_list: Test ' + folder_list[0] + ', '
				+ file_list[0]);
		console.log([ folder_list, file_list ]);
	}
	// 可能有多個資料夾，但是其他的都只是子目錄。
	if (folder_list.length > 0
			&& PATTERN_full_latin_or_sign.test(folder_list[0])) {
		// console.log(folder_list);
		rename_process(folder_list[0]);
	} else if (file_list.length === 1) {
		rename_process(file_list[0]);
	} else if (false) {
		CeL.warn(full_title + ': ' + JSON.stringify(folder_list));
		CeL.warn('file_list: [' + file_list.length + ']'
				+ JSON.stringify(file_list.slice(0, 20)));
	}

	typeof this.callback === 'function' && this.callback();
}

// Read folders inside archive and rename to the folder name.
function rename_dlsite_works(fso_name, target_directory, file_info_hash) {
	// console.trace(file_info_hash);
	if (!file_info_hash)
		return;
	var file_list = Object.keys(file_info_hash);
	// console.trace(file_list);
	var directory_list = file_list.filter(function(file_path) {
		var file_info = file_info_hash[file_path];
		if (file_info.is_folder) {
			return !!file_path;
		}
	});
	// console.trace(directory_list);

	var matched, root_directory = '', root_directory_2 = root_directory;
	while ((matched = CeL.longest_common_starting_length(
	//
	directory_list = directory_list.filter(function(directory) {
		return directory !== root_directory && (root_directory_2 = directory);
	}))) > root_directory.length) {
		root_directory = root_directory_2.slice(0, matched);
	}

	var matched = root_directory
			.match(/^(RJ\d{6,}(?:-v[\d.]+| *\([\d.]+\))?)[\\\/]([^\\\/]+)/)
			|| root_directory.match(/^()([^\\\/]+)/);
	// console.log([ root_directory, matched ]);
	var fso_id = fso_name.replace(/\.[^.]+$/, '');
	if (!matched || matched[2] === fso_id) {
		return;
	}

	if (matched[1] && matched[1] !== fso_id) {
		CeL.error(fso_name + ': ' + matched[1] + ' inside!');
	} else if (!/^[a-z]$/.test(matched[2])) {
		var move_to = '(同人) [dlsite] ' + matched[2] + '.' + fso_name
		CeL.info('rename_dlsite_works: ' + fso_name + '→'
		//
		+ move_to);
		CeL.fs_move(target_directory + fso_name, target_directory + move_to);
	}
}
